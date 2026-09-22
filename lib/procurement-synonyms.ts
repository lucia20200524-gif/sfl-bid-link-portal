import { procurementMatchText } from "./procurement-match-text";
import type { ProcurementCandidate } from "./procurement-search";

const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
// Deliberately bounded vocabulary. Related expressions are disclosed, never
// treated as evidence that a supplier is eligible for a notice.
const vocabulary = [
  ["AI研修", "生成AI研修", "AI活用研修", "生成AI活用講習", "人工知能研修"],
  ["生成AI", "生成系AI", "生成型AI"],
  ["研修", "講習", "セミナー", "人材育成"],
  ["Webサイト", "ウェブサイト", "ホームページ"],
  ["動画制作", "映像制作", "動画作成", "映像製作"],
  ["業務改善", "業務改革", "BPR"],
  ["システム開発", "システム構築"],
  ["システム改修", "システム機能改修", "システム機能追加"],
  ["運用保守", "保守運用", "運用・保守"],
  ["クラウド移行", "クラウド化"],
  ["データ入力", "データエントリー"],
  ["コピー用紙", "PPC用紙", "複写用紙"],
  ["事務用品", "事務用消耗品"],
  ["除草", "草刈り", "草刈"],
  ["清掃", "クリーニング"],
  ["会場設営", "会場の設営"],
  ["オープンカウンター", "オープンカウンタ"],
];
export type KeywordGroup = { input: string; terms: string[] };
export type ExpandedMatch = { input: string; term: string; location: "title" | "body" };

export function keywordGroups(inputs: string[], enabled = true): KeywordGroup[] {
  return inputs.map(input => {
    if (!enabled) return { input, terms: [input] };
    const query = normalize(input);
    // Prefer the longest phrase so AI研修 does not expand to AI人材育成.
    const rule = vocabulary.flatMap(terms => terms.map(term => ({ terms, term: normalize(term) })))
      .filter(rule => query.includes(rule.term)).sort((a, b) => b.term.length - a.term.length)[0];
    const aliases = rule ? rule.terms.map(alias => query.replace(rule.term, alias)) : [];
    const seen = new Set<string>();
    return { input, terms: [input, ...aliases].filter(term => {
      const key = normalize(term); if (seen.has(key)) return false; seen.add(key); return true;
    }) };
  });
}
export function expandedKeywords(inputs: string[], enabled = true): string[] {
  const groups = keywordGroups(inputs, enabled), seen = new Set<string>();
  return [...inputs, ...groups.flatMap(group => group.terms.slice(1))].filter(term => {
    const key = normalize(term); if (seen.has(key)) return false; seen.add(key); return true;
  });
}
export type KeywordMatch = KeywordGroup & {hits:{input:string;term:string;location:"title"|"body";direct:boolean}[]};
type MatchCandidate = Pick<ProcurementCandidate, "title" | "agency" | "descriptionText" | "summary">;

// Prepare query terms once per search, then reuse the same matches for filtering
// and ranking. Short English terms must not match inside unrelated English words.
export function compileKeywordMatcher(groups:KeywordGroup[],scope:"title"|"fulltext"="fulltext") {
  const compiled=groups.map(group=>({group,terms:group.terms.map(term=>{
    const key=normalize(term);
    return {term,key,direct:key===normalize(group.input),word:/^[a-z]{2,5}$/.test(key)?new RegExp(`(^|[^a-z])${key}(?=$|[^a-z])`):null};
  })}));
  const needsWords=compiled.some(group=>group.terms.some(term=>term.word));
  return (item:MatchCandidate):KeywordMatch[]=>{
    const text=procurementMatchText(item),words=needsWords?procurementMatchText(item,true):text;
    return compiled.map(({group,terms})=>({...group,hits:terms.flatMap(({term,key,direct,word})=>{
      if(!key)return [];
      const matches=(location:"title"|"body")=>word?word.test(words[location]):text[location].includes(key);
      const location=matches("title")?"title":scope==="fulltext"&&matches("body")?"body":null;
      return location?[{input:group.input,term,location,direct}]:[];
    })}));
  };
}
export function keywordMatches(item:MatchCandidate,groups:KeywordGroup[],scope:"title"|"fulltext"="fulltext") {
  return compileKeywordMatcher(groups,scope)(item);
}
