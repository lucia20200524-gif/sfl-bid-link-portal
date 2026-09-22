import { canonicalUrl, todayJst } from "./bid-domain";
import { collectionModes, engineerKeywords, type CollectionMode } from "./collection-profiles";
import { extractBidDeadline } from "./procurement-deadline";
import type { BrowserPageIssue, BrowserProgress } from "./defense-browser-types";
import { isMunicipalProcurement } from "./procurement-classification";
import type { ProcurementCandidate } from "./procurement-search";
import { keywordGroups, keywordMatches, type KeywordGroup, type ExpandedMatch, type KeywordMatch } from "./procurement-synonyms";

export const discoveryPageSize = 12;

export const discoveryTerms: Record<CollectionMode,string[]> = {
  free:[],
  sfl:["生成AI","DX","研修","リスキリング","人材育成","業務改善","BPR","ホームページ","ウェブサイト","Webサイト","広報","動画","デザイン","SNS","職員研修"],
  engineer:[...engineerKeywords,"ホームページ","ウェブサイト","Webサイト","CMS","検索システム","予約システム","申請フォーム","Webシステム","システム改修"],
  academy:["物品","事務用品","消耗品","備品","用紙","コピー用紙","トナー","印刷","製本","パンフレット","ポスター","清掃","除草","維持管理","会場設営","イベント運営"],
};
export const allDiscoveryTerms = [...new Set(collectionModes.flatMap(m=>discoveryTerms[m.id]))];
export const norm = (text:string)=>text.normalize("NFKC").toLowerCase().replace(/\s+/g,"");
export function splitKeywords(text:string) { return [...new Set(text.split(/[、,，\n]+/).map(s=>s.trim()).filter(Boolean))].slice(0,50); }
export type Milestone = { label:string; date:string; evidence:string; time?:string };
export type DiscoveryItem = ProcurementCandidate & {
  origins?:string[]; milestones?:Milestone[]; needsReview?:string[];
  firstSeen?:number; lastSeen?:number; changedAt?:number; fingerprint?:string;
  review?:"new"|"reviewed"|"dismissed"; reviewReason?:string; updatedSinceReview?:boolean;
  expandedMatches?:ExpandedMatch[]; registered?:boolean; score?:number; reasons?:string[]; withdrawalEvidence?:string;
  previewOnly?:boolean;
};
export type DiscoveryBucket = "all"|"recommended"|"related"|"attention"|"reviewed";
export type InspectionProgress={id:string;inspected:number;limit:number;endsAt:number;reason?:"limit"|"time"|"complete"|"stopped"|"error"};
export type DiscoveryProgress = { inspection?:InspectionProgress; status:string; startedAt?:number; updatedAt?:number; nextAt?:number; resultRevision?:number; processed:number; pending:number; saved:number; message:string; sources:{name:string; processed:number; pending:number; issues:string[]; officialUrl?:string; pageIssues?:BrowserPageIssue[]; targets?:BrowserProgress["targets"]}[]; retryable?:boolean; retryAt?:number; schedulerLastRun?:number };
export type DiscoveryFeed = {items:DiscoveryItem[]; pool?:DiscoveryItem[]; total:number; counts:Record<DiscoveryBucket,number>; progress:DiscoveryProgress; today:string; truncated:boolean; candidateLimitReached?:boolean; offset:number; qualificationExcluded?:number; qualificationGrades?:{goodsGrade:string;serviceGrade:string;purchaseGrade:string}};

// A search snapshot includes enough information for every card and local group,
// without transferring announcement bodies for the entire candidate pool.
export function discoveryPreview(item:DiscoveryItem):DiscoveryItem {
  return {id:item.id,title:item.title,agency:item.agency,deadline:item.deadline,
    officialUrl:item.officialUrl,source:item.source,sourceUrl:item.sourceUrl,summary:"",
    classification:item.classification,matchedKeywords:item.matchedKeywords,matchLocation:item.matchLocation,
    firstSeen:item.firstSeen,lastSeen:item.lastSeen,changedAt:item.changedAt,fingerprint:item.fingerprint,
    review:item.review,reviewReason:item.reviewReason,registered:item.registered,updatedSinceReview:item.updatedSinceReview,
    retrievalIssue:item.retrievalIssue,withdrawalEvidence:item.withdrawalEvidence,needsReview:item.needsReview,
    milestones:item.milestones?.map(m=>({label:m.label,date:m.date,evidence:""})),previewOnly:true};
}

export function groupDiscoveryFeed(feed:DiscoveryFeed,category:"all"|"open-counter"|"unified-required"|"municipal",bucket:DiscoveryBucket,offset:number):DiscoveryFeed {
  if(!feed.pool)return feed;
  // Eligibility has already been enforced by the server. Group existing results
  // by their labels; do not reclassify incomplete preview text in the browser.
  const group=feed.pool.filter(item=>category==="all"||(category==="municipal"?!!item.classification?.municipal:category==="open-counter"?!!item.classification?.openCounterEvidence:!!(item.classification?.unifiedEligibleEvidence||item.classification?.unifiedRequiredEvidence)));
  const counts={all:group.length,recommended:0,related:0,attention:0,reviewed:0};
  const selected=group.filter(item=>{const state=candidateBucket(item,feed.today);if(state!=="closed")counts[state]++;return bucket==="all"||bucket===state;});
  const pageOffset=Math.min(offset,Math.max(0,Math.ceil(selected.length/discoveryPageSize)-1)*discoveryPageSize);
  return {...feed,items:selected.slice(pageOffset,pageOffset+discoveryPageSize),counts,total:selected.length,offset:pageOffset};
}

export function milestonesFrom(text:string):Milestone[] {
  const result:Milestone[]=[];
  const normalized=text.normalize("NFKC").replace(/\s+/g,"");
  // Parse only the bounded text following an explicit earlier-deadline label.
  const labels=/(参加(?:申請|表明)(?:書)?(?:の)?(?:提出)?(?:期限|締切)|説明会(?:の)?(?:参加)?(?:申込|申込み|申し込み)(?:受付)?(?:期限|締切)|質問(?:書)?(?:の)?(?:提出|受付|受領)?(?:期限|締切)|仕様書(?:の)?(?:交付|受領)(?:期限|締切)|同等品(?:申請書)?(?:の)?(?:提出)?(?:期限|締切))/g;
  for(const match of normalized.matchAll(labels)) {
    const tail=normalized.slice(match.index!+match[0].length,match.index!+match[0].length+100);
    const bounded=tail.split(/[。;；]/,1)[0];
    const nextLabel=bounded.search(/参加(?:申請|表明)|説明会|質問(?:書)?(?:受付|提出)|仕様書|同等品|入札書?|見積書/);
    const d=extractBidDeadline("見積書提出期限"+(nextLabel<0?bounded:bounded.slice(0,nextLabel)));
    if(d && !result.some(v=>v.label===match[0]&&v.date===d.date)) result.push({label:match[0],date:d.date,evidence:d.evidence.replace("見積書提出期限",match[0])});
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date));
}
export async function digest(value:string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,"0")).join(""); }
export async function discoveryIdentity(item:ProcurementCandidate) {
  // A page can contain several notices; URL alone would merge unrelated jobs.
  // Different source URLs are not fuzzy-merged without an exact original link.
  return digest(canonicalUrl(item.officialUrl)+"|"+norm(item.title));
}
export function enrichCandidate(item:DiscoveryItem):DiscoveryItem {
  const text=item.descriptionText||item.summary;
  const milestones=[...(item.milestones??[]),...milestonesFrom(text)].filter((m,i,a)=>a.findIndex(v=>v.label===m.label&&v.date===m.date)===i).sort((a,b)=>a.date.localeCompare(b.date));
  return {...item,milestones,needsReview:[...new Set([...(item.needsReview??[]),...(!item.deadline?["入札・見積の締切を原文で確認"]:[])])]};
}
export function rankCandidate(item:DiscoveryItem,mode:CollectionMode,keywords:string[]=discoveryTerms[mode],groups:KeywordGroup[]=keywordGroups(keywords),scope:"title"|"fulltext"="fulltext",matches:KeywordMatch[]=keywordMatches(item,groups,scope)):DiscoveryItem {
  const hits=matches.flatMap(group=>group.hits);
  const direct=hits.filter(hit=>hit.direct),titleTerms=direct.filter(hit=>hit.location==="title"),bodyTerms=direct.filter(hit=>hit.location==="body");
  const expandedMatches:ExpandedMatch[]=matches.filter(group=>!group.hits.some(hit=>hit.direct)).flatMap(group=>group.hits.slice(0,1).map(({input,term,location})=>({input,term,location:location as "title"|"body"})));
  const reasons=[...titleTerms.slice(0,3).map(hit=>`件名に「${hit.term}」`),...(!titleTerms.length?bodyTerms.slice(0,3).map(hit=>`本文に「${hit.term}」`):[]),...expandedMatches.map(hit=>`言い換え：「${hit.input}」→「${hit.term}」（${hit.location==="title"?"件名":"本文"}）`),...(item.updatedSinceReview?["確認後に公告の内容が更新されています"]:[])];
  return {...item,matchedKeywords:[...new Set(hits.map(hit=>hit.term))],expandedMatches,
    matchLocation:hits.some(hit=>hit.location==="title")?"title":hits.length?"body":"provider",
    score:(direct.length?100:0)+Math.min(60,titleTerms.length*20)+Math.min(15,bodyTerms.length*3)+Math.min(12,expandedMatches.length*2),reasons};
}
export function candidateBucket(item:DiscoveryItem,today=todayJst()):DiscoveryBucket|"closed" {
  if(item.deadline && item.deadline<=today)return "closed";
  if(item.retrievalIssue)return "attention";
  if(item.registered || ((item.review==="reviewed"||item.review==="dismissed")&&!item.updatedSinceReview))return "reviewed";
  if(item.classification?.municipal || isMunicipalProcurement(item))return "attention";
  if(!item.deadline || item.withdrawalEvidence || item.needsReview?.length || item.updatedSinceReview || item.milestones?.some(m=>m.date<=today))return "attention";
  return item.matchLocation==="title"?"recommended":"related";
}
export function compareCandidates(a:DiscoveryItem,b:DiscoveryItem) {
  return (b.score??0)-(a.score??0) || (a.deadline||"9999").localeCompare(b.deadline||"9999") || (b.firstSeen??0)-(a.firstSeen??0) || a.id.localeCompare(b.id);
}
