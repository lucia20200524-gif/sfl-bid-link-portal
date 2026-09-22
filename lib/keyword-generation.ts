import { keywordGroups } from "./portal-content";
import type { CollectionMode } from "./collection-profiles";

const recommendedGroups: Record<CollectionMode, string[]> = {
  free: [],
  sfl: ["AI・DX・人材育成", "業務設計・伴走支援", "Webサイト系", "広報・コンテンツ制作"],
  engineer: ["Webサイト系", "小規模案件を拾いやすい業務名"],
  academy: ["物品・印刷・施設管理", "調査・事務・データ支援", "広報・コンテンツ制作"],
};

// Use the visible keyword collection, without a model or an external API.
export function generateSearchKeywords(mode: CollectionMode, group = "recommended") {
  const titles = group === "recommended" ? recommendedGroups[mode] : [group];
  const terms = [...new Set(titles.flatMap(title => keywordGroups.find(item => item.title === title)?.keywords ?? []))];
  const keywords: string[] = [];
  for (const term of terms) {
    if (keywords.length === 50 || [...keywords, term].join("、").length > 1000) break;
    keywords.push(term);
  }
  return { value: keywords.join("、"), count: keywords.length };
}
