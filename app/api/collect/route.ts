import { requireSearchMember } from "@/lib/member-auth";
import { ApiError, checkMutation, failure, jsonBody, reply } from "@/lib/server-store";
import { searchProcurements, SearchServiceError, type SearchScope } from "@/lib/procurement-search";
import { isProcurementSourceId, procurementSource } from "@/lib/procurement-sources";
import { defenseBrowserUnavailable, isDefenseBrowserSource } from "@/lib/defense-browser-rules";

export async function POST(request: Request) {
  try {
    checkMutation(request); await requireSearchMember(request);
    const body = await jsonBody(request);
    const input = body?.keywords ?? "";
    if (typeof input !== "string" || input.length > 1000) throw new ApiError(400, "検索キーワードは1,000文字以内で入力してください。");
    const keywords = [...new Set(input.split(/[、,\s]+/).map(v=>v.trim()).filter(v=>v.length>=2))];
    if (!keywords.length) throw new ApiError(400,"キーワードを2文字以上で入力してください。");
    if (keywords.length > 50) throw new ApiError(400, "検索キーワードは50語以内にしてください。");
    if (keywords.some(keyword=>/[()"\\]/.test(keyword)||/^(AND|OR|NOT|ANDNOT)$/i.test(keyword))) throw new ApiError(400,"括弧・引用符・検索演算子を外し、キーワードを読点で区切ってください。");
    const scope = body?.scope ?? "fulltext";
    if (!["fulltext","title"].includes(scope)) throw new ApiError(400,"検索範囲を選び直してください。");
    const sourceId = body?.sourceId ?? "kkj";
    if (!isProcurementSourceId(sourceId)) throw new ApiError(400,"検索先を選び直してください。");
    if (isDefenseBrowserSource(sourceId)) return reply({error:defenseBrowserUnavailable,code:"browser_not_connected"},503);
    if (!procurementSource(sourceId).automatic) throw new ApiError(422,`${procurementSource(sourceId).name}の自動検索・取り込みは準備中です。公式サイトで検索してください。`);
    // The search date and future-only rule are fixed on the server for every tab.
    return reply(await searchProcurements(keywords,{scope:scope as SearchScope,sourceId}));
  } catch (error) {
    if (error instanceof SearchServiceError) return reply({error:error.message},error.status);
    return failure(error);
  }
}
