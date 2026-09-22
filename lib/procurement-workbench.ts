import { z } from "zod";
import { validDate, todayJst, type Bid, type BidInput } from "./bid-domain";
import type { DiscoveryItem } from "./discovery-domain";
import type { CollectionMode } from "./collection-profiles";
import { keywordGroups, keywordMatches, type KeywordGroup, type KeywordMatch } from "./procurement-synonyms";
import { compareQualificationGrades, defaultQualificationGrades, qualificationPreset } from "./company-qualification";
import { isMunicipalProcurement } from "./procurement-classification";
import { regionTerms, selectedPrefectures } from "./prefectures";

const text = (n: number) => z.string().trim().max(n);
const date = text(10).refine(v => !v || validDate(v), "日付を確認してください。");
export const companyProfileSchema = z.object({
  name: text(150).default(""), specialties: text(1500).default(""), regions: text(500).default(""),
  goodsGrade: z.enum(["", "A", "B", "C", "D"]).default(defaultQualificationGrades.goodsGrade), serviceGrade: z.enum(["", "A", "B", "C", "D"]).default(defaultQualificationGrades.serviceGrade),
  purchaseGrade: z.enum(["", "A", "B", "C", "D"]).default(defaultQualificationGrades.purchaseGrade),
  qualificationPreset: z.literal(qualificationPreset).default(qualificationPreset),
  qualificationUntil: date.default(""), experience: text(2500).default(""), excluded: text(1000).default(""),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;
export const emptyCompanyProfile: CompanyProfile = companyProfileSchema.parse({});
export function readCompanyProfile(value?: string): CompanyProfile {
  try {
    const stored = JSON.parse(value || "{}");
    // Fixed portal-wide grades override all historical per-visitor grade edits.
    // Preserve existing expiry evidence; this read does not overwrite stored data.
    return companyProfileSchema.parse({ ...stored, ...defaultQualificationGrades, qualificationPreset });
  } catch { return companyProfileSchema.parse({}); }
}
export function candidateGradeCheck(item: DiscoveryItem) {
  return compareQualificationGrades(item.classification?.unifiedEligibleEvidence || item.classification?.unifiedRequiredEvidence || "", defaultQualificationGrades);
}
export const advancedSearchSchema = z.object({
  agency: text(200).default(""), region: text(500).default(""), deadlineFrom: date.default(""), deadlineTo: date.default(""),
  announcedFrom: date.default(""), announcedTo: date.default(""), scope: z.enum(["fulltext", "title"]).default("fulltext"),
  match: z.enum(["any", "all"]).default("any"), sort: z.enum(["recommended", "deadline", "newest", "updated"]).default("recommended"),
  period: z.enum(["future", "all", "closed"]).default("future"),
  synonyms: z.enum(["on", "off"]).default("on"),
}).refine(v => !(v.deadlineFrom && v.deadlineTo && v.deadlineFrom > v.deadlineTo), "締切の期間を確認してください。")
  .refine(v => !(v.announcedFrom && v.announcedTo && v.announcedFrom > v.announcedTo), "公告日の期間を確認してください。");
export type AdvancedSearch = z.infer<typeof advancedSearchSchema>;
export const defaultAdvancedSearch = advancedSearchSchema.parse({});
// Saved searches may contain controls that are no longer shown. Do not apply
// those invisible restrictions when restoring them in the simplified form.
export function simplifiedSearchFilters(value: Partial<AdvancedSearch> = {}): AdvancedSearch {
  return { ...defaultAdvancedSearch, region: selectedPrefectures(value.region??"").join("、"), deadlineFrom: value.deadlineFrom??"", deadlineTo: value.deadlineTo??"", synonyms: value.synonyms??"on" };
}
export const savedSearchSchema = z.object({
  name: text(80).min(1, "条件の名前を入力してください。"), mode: z.enum(["sfl", "engineer", "academy", "free"]),
  keywords: text(4000), exclude: text(1000), source: z.enum(["all", "kkj", "p-portal", "mod", "gsdf", "msdf", "asdf"]),
  category: z.enum(["all", "open-counter", "unified-required", "municipal"]), newOnly: z.boolean(), filters: advancedSearchSchema,
});
export type SavedSearchInput = z.infer<typeof savedSearchSchema>;
export type SavedSearch = SavedSearchInput & { id: string; updatedAt: number };

export const taskKinds = { review: "条件確認", briefing: "説明会・申込", question: "質問", application: "参加申請", document: "必要書類", submission: "入札・見積提出", other: "その他" } as const;
export const taskSchema = z.object({ id: text(80).min(1), title: text(200).min(1), kind: z.enum(["review", "briefing", "question", "application", "document", "submission", "other"]), date: date.default(""), time: text(5).refine(v => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "時刻を確認してください。").default(""), owner: text(150).default(""), evidence: text(1000).default(""), done: z.boolean().default(false) });
export type BidTask = z.infer<typeof taskSchema>;
export const workflowSchema = z.object({
  candidateId: text(64).regex(/^$|^[a-f0-9]{64}$/).default(""), mode: z.enum(["sfl", "engineer", "academy", "free"]).default("sfl"),
  tasks: z.array(taskSchema).max(40).default([]),
  result: z.object({ winner: text(200).default(""), amount: text(30).regex(/^$|^\d{1,15}(\.\d{1,2})?$/, "落札金額は数字で入力してください。").default(""), tax: z.enum(["unknown", "included", "excluded"]).default("unknown"), date: date.default(""), sourceUrl: text(2000).refine(v => !v || /^https?:\/\/[^\s]+$/.test(v), "結果のURLを確認してください。").default(""), reason: text(2000).default("") }).default({}),
});
export type BidWorkflow = z.infer<typeof workflowSchema>;
export const emptyWorkflow = (): BidWorkflow => workflowSchema.parse({});
export function readWorkflow(value?: string): BidWorkflow { try { return workflowSchema.parse(JSON.parse(value || "{}")); } catch { return emptyWorkflow(); } }
const normal = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
export function splitProfileTerms(s: string) { return [...new Set(s.split(/[、,，\n]+/).map(v => v.trim()).filter(Boolean))].slice(0,30); }
export function matchesAdvanced(item: DiscoveryItem, filters: AdvancedSearch, terms: string[], groups:KeywordGroup[]=keywordGroups(terms,filters.synonyms!=="off"),matches:KeywordMatch[]=keywordMatches(item,groups,filters.scope)) {
  if(matches.length && !(filters.match==="all"?matches.every(group=>group.hits.length):matches.some(group=>group.hits.length)))return false;
  if(filters.agency && !normal(item.agency).includes(normal(filters.agency)))return false;
  if(filters.region){
    const regions=regionTerms(filters.region),location=normal((item.prefecture||"")+" "+(item.region||""));
    if(regions.length && !regions.some(region=>location.includes(normal(region))))return false;
  }
  if(filters.deadlineFrom && (!item.deadline||item.deadline<filters.deadlineFrom))return false;
  if(filters.deadlineTo && (!item.deadline||item.deadline>filters.deadlineTo))return false;
  if(filters.announcedFrom && (!item.indexedDate||item.indexedDate<filters.announcedFrom))return false;
  if(filters.announcedTo && (!item.indexedDate||item.indexedDate>filters.announcedTo))return false;
  return true;
}
export type ConditionCheck = { label: string; state: "match" | "attention" | "unknown"; detail: string; evidence?: string };
export function assessCandidate(item: DiscoveryItem, profile: CompanyProfile): ConditionCheck[] {
  const result:ConditionCheck[]=[];
  const local=isMunicipalProcurement(item);
  const body=[item.qualifications,item.descriptionText||item.summary].filter(Boolean).join("\n").normalize("NFKC");
  const evidence=(pattern:RegExp)=>body.split(/(?<=[。；;])|\n+/).map(v=>v.trim()).find(v=>pattern.test(v))?.slice(0,600);
  if(local){
    result.push({label:"自治体の事業者登録",state:"unknown",detail:"独自の資格・名簿登録の要否、応募時か契約時か、未登録でも応募できるかを確認してください。全省庁統一資格の等級だけでは判定しません。",evidence:item.classification?.otherQualificationEvidence||evidence(/名簿|事業者登録|入札参加資格|未登録/)});
    result.push({label:"所在地・営業所",state:"unknown",detail:"市内・県内などの所在地要件と、営業所・保守対応体制を照合してください。履行場所とは別の条件です。",evidence:evidence(/営業所|事業所|本店|本社|所在地要件/)});
    result.push({label:"法人としての類似実績",state:"unknown",detail:"発注者・業務内容・実績期間・契約名義を確認してください。担当エンジニア個人や前職の実績が使えるとは限りません。",evidence:evidence(/類似.{0,30}実績|自治体.{0,40}実績|業務実績/)});
    result.push({label:"再委託・実施体制",state:"unknown",detail:"外部エンジニアの起用について、再委託の可否・事前承諾・担当者の所属要件を確認してください。",evidence:evidence(/再委託|第三者.{0,30}委託|実施体制/)});
  }

  const required=item.classification?.unifiedEligibleEvidence||item.classification?.unifiedRequiredEvidence;
  if(required){
    const gradeCheck=candidateGradeCheck(item);
    const expired=!!profile.qualificationUntil&&profile.qualificationUntil<todayJst();
    result.push({label:"資格・等級",state:expired||gradeCheck.state==="mismatch"?"attention":gradeCheck.state==="match"&&!!profile.qualificationUntil?"match":"unknown",detail:expired?"登録した資格の有効期限を過ぎています。":gradeCheck.detail,evidence:required});
  }else result.push({label:"資格・等級",state:"unknown",detail:"資格不要という意味ではありません。公告の参加条件を確認してください。"});
  const region=item.region||item.prefecture;
  result.push({label:"地域",state:"unknown",detail:region?`取得情報の地域：${region}。履行場所と資格の地域区分を原文で確認してください。`:"履行場所・地域要件を取得できていません。"});
  const early=item.milestones?.filter(m=>m.date<=todayJst())??[];
  result.push({label:"期限・先行手続き",state:!item.deadline?"unknown":item.deadline<=todayJst()||early.length?"attention":"unknown",detail:!item.deadline?"提出期限を原文で確認してください。":early.length?`${early.map(m=>m.label+" "+m.date).join("、")}。手続きが済んでいるか確認してください。`:`入札・見積締切：${item.deadline}。時刻・事前手続きも確認してください。`,evidence:item.deadlineEvidence});
  result.push({label:"実績・その他の条件",state:"unknown",detail:"必要実績・体制・認証などは原文と照合してください。部分的な一致だけで参加可否は確定できません。"});
  return result;
}
export function workflowFromCandidate(item:DiscoveryItem,mode:CollectionMode):BidWorkflow {
  const tasks:BidTask[]=[{id:crypto.randomUUID(),title:"参加資格・等級・地域・実績を原文で確認",kind:"review",date:"",time:"",owner:"",evidence:item.classification?.unifiedEligibleEvidence||item.classification?.unifiedRequiredEvidence||"",done:false},{id:crypto.randomUUID(),title:"必要書類・提出方法を原文で確認",kind:"document",date:"",time:"",owner:"",evidence:"",done:false}];
  for(const milestone of item.milestones??[])tasks.push({id:crypto.randomUUID(),title:milestone.label,kind:/説明会/.test(milestone.label)?"briefing":/質問/.test(milestone.label)?"question":"application",date:milestone.date,time:milestone.time||"",owner:"",evidence:milestone.evidence,done:false});
  tasks.push({id:crypto.randomUUID(),title:"入札書・見積書を提出",kind:"submission",date:item.deadline,time:"",owner:"",evidence:item.deadlineEvidence||"",done:false});
  return {...emptyWorkflow(),candidateId:item.id,mode,tasks};
}
export function candidateToBid(item:DiscoveryItem,mode:CollectionMode):Partial<BidInput> {
  return {title:item.title,agency:item.agency||"",region:item.region||item.prefecture||"",deadline:item.deadline,announcedOn:item.indexedDate||"",officialUrl:item.officialUrl,summary:(item.descriptionText||item.summary).slice(0,6000),qualifications:item.qualifications||item.classification?.otherQualificationEvidence||item.classification?.unifiedEligibleEvidence||item.classification?.unifiedRequiredEvidence||"",contractMethod:item.contractMethod||"",matchReason:item.reasons?.join("\n")||"",concerns:item.needsReview?.join("\n")||"",workflow:JSON.stringify(workflowFromCandidate(item,mode))};
}
const escapeIcs=(v:string)=>v.replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;").replace(/\r/g,"");
export function taskCalendar(bid:Bid):string {
  const events=readWorkflow(bid.workflow).tasks.filter(t=>t.date&&!t.done).map(t=>[
    "BEGIN:VEVENT",`UID:${bid.id}-${t.id}@sfl-bid-portal`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"")}`,
    t.time?`DTSTART:${new Date(`${t.date}T${t.time}:00+09:00`).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"")}`:`DTSTART;VALUE=DATE:${t.date.replaceAll("-","")}`,
    `SUMMARY:${escapeIcs(t.title+"｜"+bid.title)}`,`DESCRIPTION:${escapeIcs([t.evidence,bid.officialUrl,"原文の変更・期限時刻をご確認ください。"].join("\n"))}`,"END:VEVENT"
  ].join("\r\n"));
  const calendar=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//SFL//Bid Portal//JA","CALSCALE:GREGORIAN",...events,"END:VCALENDAR"].join("\r\n");
  // RFC 5545 lines fold at 75 octets without splitting Japanese UTF-8 characters.
  const encoder=new TextEncoder();
  return calendar.split("\r\n").map(line=>{let folded="",size=0;for(const char of line){const bytes=encoder.encode(char).length;if(size+bytes>75){folded+="\r\n ";size=1;}folded+=char;size+=bytes;}return folded;}).join("\r\n")+"\r\n";
}
export function preparationDraft(bid:Bid,kind:"question"|"proposal") {
  if(kind==="question")return `件名：【質問】${bid.title}\n\n${bid.agency} ご担当者様\n\n「${bid.title}」について、以下を確認させてください。\n\n1. 対象資料・ページ：【記入】\n2. 該当する記載：【原文を記入】\n3. 確認したい事項：【記入】\n\n回答方法・質問受付期限は公告の指定に従います。\n\n会社名：【記入】\n担当者：【記入】\n連絡先：【記入】`;
  return `【提案書の構成メモ・未完成】\n案件名：${bid.title}\n発注機関：${bid.agency}\n原文：${bid.officialUrl||"未登録"}\n\n1. 業務の理解\n${bid.summary||"【仕様書に基づき記入】"}\n\n2. 必須要件への対応\n${bid.qualifications||"【参加資格・成果物・必須要件を原文で確認】"}\n\n3. 実施方法・工程\n【仕様書と評価基準に沿って記入】\n\n4. 実施体制・類似実績\n【確認できる自社の情報を記入。実績を推測で補完しない】\n\n5. 品質管理・納品物\n【検査・受入条件を原文で確認】\n\n6. 費用\n【見積根拠を記入】\n\n7. 提出前の確認\n${readWorkflow(bid.workflow).tasks.map(t=>`□ ${t.title}${t.date?"（"+t.date+"）":""}`).join("\n")}\n\n※これは定型の構成メモです。AIによる解析結果ではありません。指定様式・評価項目に合わせて完成させてください。`;
}
