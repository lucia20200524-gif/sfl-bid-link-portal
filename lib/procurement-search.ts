import { isExcludedProcurement } from "./procurement-exclusions";
import { dateOffset, safePublicUrl, todayJst, validDate } from "./bid-domain";
import { classifyProcurement, matchesParticipationScope, type ProcurementClassification } from "./procurement-classification";
import { matchesProcurementSource, procurementSource, type ProcurementSourceId } from "./procurement-sources";
import { extractBidDeadline, isFutureBidDeadline } from "./procurement-deadline";
import { defenseBrowserUnavailable, isDefenseBrowserSource } from "./defense-browser-rules";

export const SEARCH_SOURCE = "官公需情報ポータル";
export const SEARCH_SOURCE_URL = "https://www.kkj.go.jp/s/";
export const SEARCH_LIMIT = 100;
export const SEARCH_SCAN_LIMIT = 300;
export const RECOMMENDATION_LIMIT = 20;
const RECOMMENDATION_BASIS = "件名での一致を優先し、一致キーワード数が多い順に表示します。同じ条件では締切が近い順です。";
export type SearchScope = "fulltext" | "title";
export type SearchOptions = { scope: SearchScope; sourceId?: ProcurementSourceId };
export type ProcurementCandidate = {
  id: string; title: string; agency: string; deadline: string;
  officialUrl: string; source: string; sourceUrl: string; matchedKeywords: string[]; summary: string;
  indexedDate?: string; prefecture?: string; region?: string; qualifications?: string; contractMethod?: string;
  matchLocation?: "title" | "body" | "provider";
  classification?: ProcurementClassification;
  searchSourceId?: ProcurementSourceId;
  deadlineEvidence?: string;
  descriptionText?: string;
  retrievalIssue?: { message: string; attemptedAt: number };
};
export type ProcurementResult = {
  method?: "official-browser";
  items: ProcurementCandidate[];
  sources: { title: string; status: "ok" | "failed" | "partial"; count: number }[];
  collectedAt?: string; message?: string; totalHits?: number; returnedCount?: number;
  limit?: number; skippedCount?: number;
  scopeNotice?: string; inspectedCount?: number; matchedCount?: number;
  upstreamHits?: number;
  recommendation?: { reason: "response-too-large"; limit: number; basis: string };
  deadlineStats?: { future: number; closed: number; unknown: number };
  search?: SearchOptions & { keywords: string[]; searchedOn: string; deadlineFrom: string; deadlinePolicy: "future-only" };
};
export class SearchServiceError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
class ResponseTooLargeError extends SearchServiceError {
  constructor() { super("取得件数を減らしても検索データを受信できませんでした。案件が0件という意味ではありません。時間をおいて再検索してください。"); }
}

// Decode text only; never evaluate markup or resolve external XML entities.
function decodeText(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
    const named: Record<string,string> = {amp:"&",lt:"<",gt:">",quot:'"',apos:"'"};
    if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
    const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2),16) : parseInt(code.slice(1),10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : "";
  });
}
function field(xml: string, name: string): string {
  const raw = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] ?? "";
  return raw.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g).map(part=>part.startsWith("<![CDATA[") ? part.slice(9,-3) : decodeText(part)).join("").trim();
}
const normalized = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
function plainText(value: string): string {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function excerpt(text: string, keywords: string[]): string {
  const clean = plainText(text);
  const positions = keywords.map(keyword=>clean.toLowerCase().indexOf(keyword.toLowerCase())).filter(index=>index>=0);
  const start = positions.length ? Math.max(0,Math.min(...positions)-45) : 0;
  return `${start ? "…" : ""}${clean.slice(start,start+240)}${clean.length > start+240 ? "…" : ""}`;
}
function validLink(value: string): boolean {
  if (!safePublicUrl(value) || value.length > 2000) return false;
  const host = new URL(value).hostname;
  return !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host) && !host.endsWith(".local");
}
export function buildSearchUrl(keywords: string[], options: SearchOptions): URL {
  const url = new URL("https://www.kkj.go.jp/api/");
  const sourceId = options.sourceId ?? "kkj";
  if (isDefenseBrowserSource(sourceId)) throw new SearchServiceError(defenseBrowserUnavailable,503);
  if (!procurementSource(sourceId).automatic) throw new SearchServiceError(`${procurementSource(sourceId).name}は公式サイトで検索してください。このアプリには自動取得の接続がありません。`,422);
  url.searchParams.set(options.scope === "title" ? "Project_Name" : "Query", keywords.join(" OR "));
  // The official API has no reliable closing-date filter. Inspect a bounded set
  // before filtering by source and confirmed future deadlines.
  url.searchParams.set("Count", String(SEARCH_SCAN_LIMIT));
  if (sourceId === "mod") url.searchParams.set("Organization_Name", "防衛省");
  // No announcement-date lookback: an older notice may still have a future deadline.
  return url;
}
export function parseSearchResponse(xml: string, keywords: string[], maxRecords=Infinity): { items: ProcurementCandidate[]; totalHits: number; returnedCount: number; inspectedCount:number; skippedCount: number } {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || !/^\s*(?:<\?xml[^>]*>\s*)?<Results\b[^>]*>[\s\S]*<\/Results>\s*$/.test(xml)) throw new SearchServiceError("検索サービスから正しい案件データを取得できませんでした。時間をおいて再検索してください。");
  if (/<Error(?:\s|>)/.test(xml)) throw new SearchServiceError("検索サービスがエラーを返しました。キーワードを減らすか、時間をおいて再検索してください。");
  const hits = field(xml,"SearchHits");
  if (!/^\d+$/.test(hits) || !Number.isSafeInteger(Number(hits))) throw new SearchServiceError("検索件数を確認できませんでした。再検索してください。");
  const totalHits = Number(hits);
  const records = [...xml.matchAll(/<SearchResult(?:\s[^>]*)?>([\s\S]*?)<\/SearchResult>/g)];
  if (records.length !== (xml.match(/<SearchResult(?:\s[^>]*)?>/g)||[]).length || (totalHits > 0 && !records.length) || (totalHits === 0 && records.length > 0)) throw new SearchServiceError("検索結果の取得が途中で終了しました。再検索してください。");
  const items: ProcurementCandidate[] = [];
  const seen = new Set<string>();
  for (const record of records.slice(0,maxRecords)) {
    const body = record[1];
    const title = plainText(field(body,"ProjectName")).slice(0,250);
    const officialUrl = field(body,"ExternalDocumentURI");
    if (!title || !validLink(officialUrl)) continue;
    const agency = plainText(field(body,"OrganizationName")).slice(0,200);
    const key = field(body,"Key");
    const dedupe = `${normalized(title)}|${officialUrl}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const description = field(body,"ProjectDescription");
    const titleTerms = keywords.filter(keyword=>normalized(title).includes(normalized(keyword)));
    const bodyText = normalized(description);
    const bodyTerms = keywords.filter(keyword=>bodyText.includes(normalized(keyword)));
    const indexed = field(body,"CftIssueDate").slice(0,10);
    const qualifications = plainText(field(body,"Certification")).slice(0,2000);
    const contractMethod = plainText(field(body,"ProcedureType")).slice(0,150);
    const classification = classifyProcurement({title,description:plainText(description),qualifications,contractMethod});
    const deadline = extractBidDeadline(description);
    items.push({
      id:key || dedupe, title, agency, officialUrl, deadline:deadline?.date ?? "", deadlineEvidence:deadline?.evidence, source:agency || SEARCH_SOURCE, sourceUrl:SEARCH_SOURCE_URL,
      matchedKeywords:[...new Set([...titleTerms,...bodyTerms])], matchLocation:titleTerms.length ? "title" : bodyTerms.length ? "body" : "provider",
      summary:excerpt(description,titleTerms.length ? titleTerms : bodyTerms), descriptionText:plainText(description).slice(0,24000), indexedDate:validDate(indexed) ? indexed : "",
      prefecture:plainText(field(body,"PrefectureName")).slice(0,50),
      region:plainText([field(body,"PrefectureName"),field(body,"CityName")].filter(Boolean).join(" ")).slice(0,150),
      qualifications, contractMethod:classification.openCounterEvidence ? "オープンカウンター" : contractMethod,
      classification,
    });
  }
  if (totalHits > 0 && !items.length && !Number.isFinite(maxRecords)) throw new SearchServiceError("該当する案件はありますが、有効な案件リンクを取得できませんでした。公式検索ページで確認してください。");
  items.sort((a,b)=>(b.indexedDate||"").localeCompare(a.indexedDate||""));
  return {items,totalHits,returnedCount:records.length,inspectedCount:Math.min(records.length,maxRecords),skippedCount:records.length-items.length};
}
async function readResponse(response: Response): Promise<string> {
  const maxBytes = 12 * 1024 * 1024;
  if (Number(response.headers.get("Content-Length")||0) > maxBytes) {
    await response.body?.cancel();
    throw new ResponseTooLargeError();
  }
  if (!response.body) throw new SearchServiceError("検索データを受信できませんでした。再検索してください。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ResponseTooLargeError();
      }
      text += decoder.decode(chunk.value,{stream:true});
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
async function fetchSearchResults(keywords: string[], options: SearchOptions) {
  // Count is the official API's maximum returned-record count. Preserve every
  // query/source parameter and share one time budget across bounded retries.
  // https://www.kkj.go.jp/doc/ja/api_guide.pdf
  const signal = AbortSignal.timeout(55000);
  const counts = [SEARCH_SCAN_LIMIT, 50, 10, 1];
  for (const count of counts) {
    signal.throwIfAborted();
    const url = buildSearchUrl(keywords,options);
    url.searchParams.set("Count",String(count));
    try {
      const response = await fetch(url, {headers:{Accept:"application/xml,text/xml", "User-Agent":"SFL-Bid-Portal/2.0"}, signal});
      if (!response.ok) {
        await response.body?.cancel();
        throw new SearchServiceError(`検索サービスに接続できませんでした（HTTP ${response.status}）。時間をおいて再検索してください。`);
      }
      const data = parseSearchResponse(await readResponse(response),keywords);
      return {data, recommended:count !== SEARCH_SCAN_LIMIT};
    } catch (error) {
      // Never retry malformed data or mask connection failures as empty results.
      if (!(error instanceof ResponseTooLargeError) || count === 1) throw error;
    }
  }
  throw new ResponseTooLargeError();
}
function compareRecommendations(a: ProcurementCandidate, b: ProcurementCandidate): number {
  return Number(b.matchLocation === "title") - Number(a.matchLocation === "title")
    || b.matchedKeywords.length - a.matchedKeywords.length
    || a.deadline.localeCompare(b.deadline)
    || a.title.localeCompare(b.title,"ja")
    || a.officialUrl.localeCompare(b.officialUrl);
}
export async function searchProcurements(keywords: string[], options: SearchOptions): Promise<ProcurementResult> {
  const today = todayJst();
  const sourceId = options.sourceId ?? "kkj";
  if (isDefenseBrowserSource(sourceId)) throw new SearchServiceError(defenseBrowserUnavailable,503);
  const selected = procurementSource(sourceId);
  let data: ReturnType<typeof parseSearchResponse>;
  let recommended: boolean;
  try {
    ({data,recommended} = await fetchSearchResults(keywords,options));
  } catch (error) {
    if (error instanceof SearchServiceError) throw error;
    throw new SearchServiceError("検索サービスから応答がありませんでした。0件という意味ではありません。時間をおいて再検索してください。",504);
  }
  const matching = data.items.filter(item => !isExcludedProcurement(item) && matchesProcurementSource(sourceId,item));
  const future = matching.filter(item => isFutureBidDeadline(item.deadline,today)).sort(recommended ? compareRecommendations : (a,b)=>a.deadline.localeCompare(b.deadline));
  const limit = recommended ? RECOMMENDATION_LIMIT : SEARCH_LIMIT;
  const permitted=future.filter(item=>matchesParticipationScope(item));
  const items = permitted.slice(0,limit).map(item => ({...item,searchSourceId:sourceId}));
  const unknown = matching.filter(item => !validDate(item.deadline)).length;
  const deadlineStats = {future:future.length,closed:matching.length-future.length-unknown,unknown};
  const excluded = data.items.length - matching.length;
  const partial = recommended || data.totalHits > data.returnedCount || unknown > 0 || data.skippedCount > 0 || excluded > 0 && sourceId !== "p-portal";
  const totalHits = partial ? undefined : permitted.length;
  const scopeNotice = `${selected.coverage}取得した${data.returnedCount}件のうち、選んだ検索先の${matching.length}件で締切日の記載を調べました。${partial ? "表示件数は取得範囲内の件数で、検索先全体の検索件数ではありません。" : ""}${!recommended && partial ? "キーワードを絞るか、公式サイトでも確認してください。" : ""}${!recommended && future.length > limit ? `未来の締切が確認できた${future.length}件のうち、締切が近い${limit}件を表示しています。` : ""}`;
  return {...data,items,totalHits,upstreamHits:data.totalHits,deadlineStats,limit,scopeNotice,inspectedCount:data.returnedCount,matchedCount:matching.length,
    ...(recommended ? {recommendation:{reason:"response-too-large" as const,limit,basis:RECOMMENDATION_BASIS}} : {}),
    collectedAt:new Date().toISOString(),sources:[{title:selected.name,status:partial ? "partial" : "ok",count:items.length}],
    search:{...options,sourceId,keywords,searchedOn:today,deadlineFrom:dateOffset(today,1),deadlinePolicy:"future-only"},
    message:items.length ? recommended ? `${selected.name}：検索データが多いため、取得範囲内のおすすめ${items.length}件を表示しました。` : `${selected.name}：締切が検索日より未来の${items.length}件を表示しました。`
      : "取得した情報の中に、統一資格・オープンカウンターの表示条件と未来の入札締切を確認できる案件はありませんでした。"};
}
