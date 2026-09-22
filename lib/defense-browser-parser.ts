import { parseHTML } from "linkedom/worker";
import { extractBidDeadline, type BidDeadline } from "./procurement-deadline";
import { validDate } from "./bid-domain";
import { defenseBrowserRules, type DefenseSourceId } from "./defense-browser-rules";
import { officialHttpError } from "./defense-fetch-error";
import { msdfProcurementCatalog } from "./msdf-procurement-catalog";
import { asdfProcurementCatalog } from "./asdf-procurement-catalog";
import { isExcludedGsdfUrl, isProcurementGuide } from "./procurement-exclusions";

export const normalizeBrowserText = (s: string) => s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
const clean = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
export type OfficialLink = { url: string; title: string; notice: boolean; priority?: number; listingEvidence?: OfficialNotice };
export type OfficialNotice = { title: string; url: string; text: string; deadline?: BidDeadline; milestones?:{label:string;date:string;evidence:string}[] };
export type ParsedOfficialPage = { title: string; links: OfficialLink[]; notices: OfficialNotice[]; targetLinks: (string | undefined)[]; issue?:string };

// Client-supplied URLs are never accepted. This allowlist is also checked on
// every discovered link, PDF redirect and browser request.
export function officialDefenseUrl(raw: string, base?: string): string | undefined {
  try {
    if (raw.length > 1000) return;
    const url = new URL(raw, base);
    if (url.protocol !== "https:" || url.hostname !== "www.mod.go.jp" || url.port || url.username || url.password) return;
    if (!/^\/(?:(?:gsdf|msdf|asdf)\/|j\/budget\/chotatsu\/)/i.test(url.pathname)) return;
    if (/\.(?:zip|exe|xls[xm]?|docx?|pptx?|jpg|png|gif|mp4)$/i.test(url.pathname)) return;
    url.hash = "";
    return url.href;
  } catch { return; }
}
const procurementLink = /調達|入札|公告|公示|公募|契約|見積|オープンカウンタ|企画競争|プロポーザル|発注|会計|駐屯地|基地|方面|部隊|nyuu?satsu|chouta[st]u|koukoku|keiyaku|bukei|procurement|open.?counter/i;
const excludedLink = /募集要項.*自衛官|落札結果|契約結果|入札結果|個人情報|アクセスマップ|サイトマップ|プライバシー|お問い合わせ/;
const supportingDocument = /参加申込(?:書|用紙)|同等品承認申請|契約関係書類|契約(?:書式|一般条項)|入札(?:及び|および)契約心得|実施要領|請求書|委任状|記録用紙|押印省略|サプライチェーン|^(?:入札書(?!提出)|(?:参考)?見積書(?!提出)|市価調査|市場価格調査|価格調査|資格確認申請書|工事費内訳|誓約書)(?:$|[\s・、(（]|様式|等|書|内訳)/;
const nonNoticeDocument = /標準契約|契約条項|契約心得|各種書類|書式|記入例|基地紹介|駐屯地紹介|学校紹介|学校パンフレット|電話番号.*変更|アクセスマップ|広報誌|採用情報|隊員募集|フォト|ギャラリー/;
const procurementMenu = /調達|入札|公告|公示|公募|見積依頼|オープン[・\s-]?カウンタ|物品.*役務|契約情報|会計|調度|発注情報|一般競争|企画競争/;
const unitLink = /(?:方面隊|地方総監部|補給処|基地(?:隊|分遣隊)?|駐屯地|会計隊|支処|学校|病院)(?:の?ホームページ)?$/;
// Prefer labels over the containing URL: /bukei/ and /choutatsu/ also
// contain school brochures, forms and award archives.
export function procurementLinkPriority(title:string,url:string,evidence=false) {
  if(isProcurementGuide(title))return 99;
  if(evidence)return 0;
  const label=normalizeBrowserText(title);
  if(excludedLink.test(label)||resultSection(label)||supportingDocument.test(label)||(nonNoticeDocument.test(label)&&!/(?:制作|作成|印刷|委託|購入|改修|運用|清掃|業務)/.test(label)))return 99;
  const pdf=/\.pdf$/i.test(new URL(url).pathname);
  if(!pdf&&procurementMenu.test(label))return 1;
  if(pdf)return 2;
  if(unitLink.test(label))return 3;
  const filename=new URL(url).pathname.split('/').filter(Boolean).at(-1)??'';
  if(/nyuu?sat[su]|nyusatu|chouta[st]u|tyoutatu|koukoku|koubo|keiyaku|procurement|open|^oc[_.-]/i.test(filename))return 1;
  return 4;
}
const deadlineHeading = /^(?:入札書|入札|見積(?:り|もり)?書|企画提案書|技術提案書|提案書)(?:等)?(?:の)?(?:提出|受領|受付|送付)?(?:締め?切り?|締切|期限)(?:予定)?(?:日時|日|時刻)?$/;

export function tableDeadline(heading: string, value: string, context: string): BidDeadline | undefined {
  const label = normalizeBrowserText(heading).replace(/[()（）]/g, "");
  if (!deadlineHeading.test(label)) return;
  const direct = extractBidDeadline(`${label}：${value}`);
  if (direct) return direct;
  const s = clean(value);
  const date = s.match(/^(?:(令和|R)?(\d{1,2})[./年-])?(\d{1,2})[./月-](\d{1,2})日?(?:\s|\(|$)/i);
  if (!date) return;
  const era = [...context.normalize("NFKC").matchAll(/令和(\d{1,2})年(?:度|[^\n]{0,24}現在)/g)].map(m=>Number(m[1]));
  const years = [...new Set(era)];
  let year: number;
  if (date[2]) {
    if (!date[1] && (years.length !== 1 || years[0] !== Number(date[2]))) return;
    year = 2018 + Number(date[2]);
  } else {
    if (years.length !== 1) return;
    year = 2018 + years[0];
  }
  // A second date or range must be handled explicitly, never take its first date.
  if (/[~〜～]|から|\d{1,2}[./月-]\d{1,2}/.test(s.slice(date[0].length))) return;
  const result = `${year}-${date[3].padStart(2,"0")}-${date[4].padStart(2,"0")}`;
  return validDate(result) ? { date: result, evidence: `${clean(heading)}：${s}（ページに令和${year-2018}年の記載）` } : undefined;
}

const titleHeading = /^(?:(?:入札|調達|公示|見積)?件名(?:\((?:ファイル名|filename|品名)\))?|品名(?:等|\(件名\)(?:及び概要)?)?|調達品目|公告内容)$/;
function resultSection(value:string) {
  // A combined request/results listing still contains current notices.
  return !/見積依頼[・及び]+結果/.test(value) && /(?:見積(?:依頼)?(?:の)?|落札|契約|入札)結果|受注決定者|決定価格|公共調達の適正化|^(?:過去の|前年度の)?結果$/.test(value);
}

export function parseOfficialHtml(html: string, url: string, sourceId: DefenseSourceId, noticeTitle?: string): ParsedOfficialPage {
  const { document } = parseHTML(html);
  document.querySelectorAll("script,style,noscript").forEach(el=>el.remove());
  const text = clean(document.documentElement?.textContent ?? "");
  const title = clean(document.querySelector("title")?.textContent ?? "");
  const catalog=sourceId==="msdf"?msdfProcurementCatalog:sourceId==="asdf"?asdfProcurementCatalog:[];
  const knownOpenListing=catalog.some(entry=>entry.listings.some(listing=>listing.url===url&&/^オープンカウンタ/.test(listing.title)));
  if (/セキュリティ検証の実行|verify you are human|just a moment|checking your browser|access denied|アクセスが拒否|captcha|ロボットではない/i.test(`${title} ${text.slice(0,1600)}`)) throw officialHttpError(403);
  const errorTitle=title.match(/^(404|403|500)\b/);if(errorTitle)throw officialHttpError(Number(errorTitle[1]));
  const rawBase=document.querySelector("base[href]")?.getAttribute("href");
  const linkBase=rawBase?officialDefenseUrl(rawBase,url):url;
  if(!linkBase)throw new Error("リンクの基準が公式の調達ページ以外を指しているため未確認です。");
  const frames=[...document.querySelectorAll("frame[src],iframe[src]")].flatMap(frame=>{
    const frameUrl=officialDefenseUrl(frame.getAttribute("src")??"",linkBase);
    return frameUrl&&!isExcludedGsdfUrl(frameUrl)?[{url:frameUrl,title:clean(frame.getAttribute("title")||"掲載内容"),notice:false}]:[];
  });
  if(text.length<20&&!frames.length&&!document.querySelector("a[href],area[href]"))throw new Error("ページの本文を確認できませんでした。");
  const allLinks = [...document.querySelectorAll("a[href],area[href]")].map(a=>({
    element: a, url: officialDefenseUrl(a.getAttribute("href") ?? "",linkBase),
    title: clean(a.textContent?.trim() || a.getAttribute("alt") || a.getAttribute("aria-label") || a.getAttribute("title") || a.querySelector("img")?.getAttribute("alt") || ""),
  })).filter(a=>a.url&&!isExcludedGsdfUrl(a.url));
  const targetLinks = defenseBrowserRules[sourceId].targets.map(target=> {
    const norm = normalizeBrowserText(target);
    const matches = allLinks.filter(a=>normalizeBrowserText(a.title).replace(/[(（]?(?:外部リンク|新しい(?:タブ|ウィンドウ)で開きます|別ウ[ィイ]ンドウで開きます)[)）]?/g,"").replace(/[↗→]/g,"") === norm);
    const unique = [...new Set(matches.map(a=>a.url!))];
    return unique.length === 1 ? unique[0] : undefined;
  });
  const links = new Map<string,OfficialLink>();
  // Mixed base pages contain bids, open-counter requests and award archives.
  // Track their actual sections instead of applying a later OC heading to all rows.
  type Section="bid"|"open"|"result";
  let section:Section=knownOpenListing||/^オープンカウンタ/.test(title)?"open":"bid";
  const sections=new Map<Element,Section>();
  for(const element of document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,div,span,font,strong,b,img,table,a,area")){
    if(/^(TABLE|A|AREA)$/.test(element.tagName)){sections.set(element,section);continue;}
    const enclosingTable=element.closest("table");
    if(element.closest("nav,header,footer")||(enclosingTable&&!enclosingTable.querySelector("table"))||element.querySelector("table,a[href]"))continue;
    const label=clean(element.getAttribute("alt")||element.textContent||"");
    if(!label||label.length>110)continue;
    if(resultSection(label))section="result";
    else if(/オープンカウンタ|見積依頼/.test(label)&&!/ではない|を除く|対象外/.test(label))section="open";
    else if(/入札(?:情報|公告)|公示情報|政府調達/.test(label))section="bid";
  }
  frames.forEach(frame=>links.set(frame.url,frame));
  for (const a of allLinks) {
    let priority=procurementLinkPriority(a.title,a.url!);
    if (priority===99 || sections.get(a.element)==="result") continue;
    const pdf = /\.pdf$/i.test(new URL(a.url!).pathname);
    const nearby=clean(a.element.closest('li,td')?.textContent??'');
    const listingContext=procurementMenu.test(title)||procurementMenu.test(nearby);
    const categoryMenu=listingContext&&/^(?:役務|物品|糧食|工事|OC)$/i.test(normalizeBrowserText(a.title));
    if(categoryMenu)priority=1;
    if(priority===4&&listingContext&&/^(?:こちら|詳細|一覧|次(?:へ|のページ)|続きを見る|\d+|(?:令和\d+|20\d{2})年度?)(?:[＞>→]|はこちら)*$/.test(normalizeBrowserText(a.title)))priority=1;
    const namedNotice=!categoryMenu&&!unitLink.test(normalizeBrowserText(a.title))&&!/(?:一覧|情報|トップ|ホームページ)$/.test(a.title)&&/業務|清掃|印刷|借上|購入|整備|修繕|委託|研修|システム|物品|用紙|トナー/.test(a.title);
    if (pdf || namedNotice || procurementLink.test(normalizeBrowserText(a.title)) || priority===1 || priority===3) links.set(a.url!,{url:a.url!,title:a.title,notice:pdf||namedNotice,priority});
  }
  const notices: OfficialNotice[] = [];
  // Expand row/column spans so a deadline cannot shift into a delivery-date cell.
  for (const table of document.querySelectorAll("table")) {
    if (table.querySelector("table")) continue;
    if(sections.get(table)==="result")continue;
    const grid: Element[][] = [];
    const rows = [...table.querySelectorAll("tr")].slice(0,1000);
    rows.forEach((row,r)=>{
      grid[r] ??= [];
      let c = 0;
      for (const cell of [...row.children].filter(el=>/^(TD|TH)$/.test(el.tagName))) {
        while (grid[r][c]) c++;
        const cols = Math.min(40,Number(cell.getAttribute("colspan"))||1);
        const spans = Math.min(20,Number(cell.getAttribute("rowspan"))||1);
        for(let y=0;y<spans;y++) { grid[r+y] ??= []; for(let x=0;x<cols;x++) if(c+x<80) grid[r+y][c+x]=cell; }
        c += cols;
      }
    });
    let headers: string[] = [];
    for (const cells of grid) {
      const values = cells.map(c=>clean(c?.textContent ?? ""));
      if (values.some(v=>titleHeading.test(normalizeBrowserText(v)))) { headers = values; continue; }
      const ti = headers.findIndex(v=>titleHeading.test(normalizeBrowserText(v)));
      if (ti < 0 || !values[ti] || cells.length !== headers.length) continue;
      const archive=headers.some(h=>/受注決定者|決定価格|提出者数|公表掲載年月日|^結果等$/.test(normalizeBrowserText(h)));
      const excludedColumns=new Set(cells.filter((_,i)=>/結果|市価調査|市場価格|価格調査|委任状|^入札書$|^見積書$/.test(normalizeBrowserText(headers[i]))));
      for(const cell of new Set(cells))if(archive||excludedColumns.has(cell))for(const a of cell?.querySelectorAll("a[href]")??[]){const href=officialDefenseUrl(a.getAttribute("href")??"",linkBase);if(href)links.delete(href);}
      if(archive)continue;
      const itemTitle = values[ti].slice(0,250);
      if (/該当.*(?:ありません|なし)|現在.*(?:ありません|なし)|^[-―ー\s]+$/.test(itemTitle) || supportingDocument.test(itemTitle)) continue;
      const rowText = values.map((v,i)=>`${headers[i]}：${v}`).join(" / ");
      const deadlines = values.map((v,i)=>tableDeadline(headers[i],v,text)).filter((d): d is BidDeadline=>!!d);
      const deadline = new Set(deadlines.map(d=>d.date)).size===1 ? deadlines[0] : undefined;
      const milestones=values.flatMap((v,i)=>{
        if(!/参加(?:申込|申請|表明).*期限|同等品.*期限|仕様書.*(?:交付|受領).*期限/.test(normalizeBrowserText(headers[i])))return [];
        const date=tableDeadline("見積書提出期限",v,text);
        return date?[{label:headers[i],date:date.date,evidence:date.evidence.replace("見積書提出期限",headers[i])}]:[];
      });
      const usable=(a:Element)=>!supportingDocument.test(clean(a.textContent??""))&&!resultSection(clean(a.textContent??""));
      const titleLinks = [...(cells[ti]?.querySelectorAll("a[href]") ?? [])].filter(usable).map(a=>officialDefenseUrl(a.getAttribute("href")??"",linkBase)).filter((v):v is string=>!!v);
      const rowDocuments = [...new Set(cells)].filter(cell=>!excludedColumns.has(cell)).flatMap(cell=>[...(cell?.querySelectorAll("a[href]")??[])]).filter(usable).map(a=>({
        url:officialDefenseUrl(a.getAttribute("href")??"",linkBase),label:clean(a.textContent??"")
      })).filter(a=>a.url && /\.pdf$/i.test(new URL(a.url!).pathname));
      const primaryDocument = rowDocuments.find(a=>/公告|公示|見積依頼/.test(a.label)) ?? rowDocuments[0];
      const officialUrl = titleLinks[0] ?? primaryDocument?.url ?? url;
      const context = sections.get(table)==="open" ? "調達方式：オープンカウンター。" : "";
      const listingEvidence = {title:itemTitle,url:officialUrl,text:context+rowText,deadline,milestones};
      if (officialUrl === url) notices.push({title:itemTitle,url:officialUrl,text:context+rowText,deadline,milestones});
      for(const href of titleLinks) links.set(href,{url:href,title:itemTitle,notice:true,listingEvidence});
      // Documents in an adjacent 公告/仕様書 cell belong to the same row.
      for(const doc of rowDocuments)links.set(doc.url!,{url:doc.url!,title:itemTitle,notice:true,listingEvidence});
    }
  }
  if (noticeTitle && !notices.length) {
    const heading = clean(document.querySelector("h1")?.textContent ?? "");
    notices.push({title:(noticeTitle || heading || title).slice(0,250),url,text:text.slice(0,100000),deadline:extractBidDeadline(text)});
  }
  const issue=/データを読み込み中|ファイルが読み込まれていません/.test(text)&&!notices.length
    ? "動的表示の案件本文を確認できていません。公式ページで掲載内容をご確認ください。" : undefined;
  // Row documents take precedence over general navigation and form links.
  return { title, links:[...links.values()].filter(link=>!isExcludedGsdfUrl(link.url)).map(link=>({...link,priority:link.listingEvidence?0:link.priority??1})).sort((a,b)=>a.priority-b.priority),notices:notices.filter(notice=>!isExcludedGsdfUrl(notice.url)),targetLinks,issue };
}
