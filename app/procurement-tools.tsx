"use client";
import { OpportunityBrief, OpportunityType, SynonymReasons } from "./opportunity-cards";
import { useEffect, useId, useState, type ReactNode } from "react";
import { BookmarkPlus, ShieldCheck, SlidersHorizontal, Trash2, LockKeyhole, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { prefectureGroups, selectedPrefectures } from "@/lib/prefectures";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { advancedSearchSchema, simplifiedSearchFilters, defaultAdvancedSearch, emptyCompanyProfile, assessCandidate, type AdvancedSearch, type CompanyProfile, type SavedSearch, type SavedSearchInput } from "@/lib/procurement-workbench";
import { defaultQualificationGrades, qualificationCategories } from "@/lib/company-qualification";
import { DiscoveryProvenance } from "./discovery-provenance";
import { procurementBrief } from "@/lib/procurement-brief";
import type { DiscoveryItem } from "@/lib/discovery-domain";
import type { CollectionMode } from "@/lib/collection-profiles";

export async function workbenchRequest<T>(path:string,body?:unknown):Promise<T>{const r=await fetch(path,{method:body?"POST":"GET",cache:"no-store",...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});const data=await r.json() as T & {error?:string;code?:string};if(!r.ok){if(data.code==="member_login_required")window.dispatchEvent(new CustomEvent("portal-access-denied",{detail:{status:r.status,code:data.code,message:data.error}}));throw new Error(data.error||"保存できませんでした。時間をおいて再度お試しください。");}return data;}
export function SearchTools({mode,current,onApply,onProfile}:{mode:CollectionMode;current:Omit<SavedSearchInput,"name">;onApply:(s:Omit<SavedSearchInput,"name">)=>void;onProfile:(p:CompanyProfile)=>void}){
  const [profile,setProfile]=useState<CompanyProfile>(emptyCompanyProfile),[searches,setSearches]=useState<SavedSearch[]>([]),[filters,setFilters]=useState(()=>simplifiedSearchFilters(current.filters)),[name,setName]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
  useEffect(()=>{let active=true;workbenchRequest<{profile:CompanyProfile;searches:SavedSearch[]}>("/api/procurement-workbench").then(v=>{if(active){setProfile(v.profile);onProfile(v.profile);setSearches(v.searches);setReady(true);}}).catch(e=>active&&setError(e.message));return()=>{active=false;};},[onProfile]);
  useEffect(()=>setFilters(simplifiedSearchFilters(current.filters)),[current.filters]);
  const prefectureId=useId(), selected=selectedPrefectures(filters.region);
  const togglePrefecture=(prefecture:string,checked:boolean)=>setFilters(value=>{const chosen=selectedPrefectures(value.region);return {...value,region:(checked?[...new Set([...chosen,prefecture])]:chosen.filter(item=>item!==prefecture)).join("、")};});
  const action=async(body:unknown,message:string)=>{setBusy(true);setError("");setNotice("");try{await workbenchRequest("/api/procurement-workbench",body);const next=await workbenchRequest<{searches:SavedSearch[]}>("/api/procurement-workbench");setSearches(next.searches);setNotice(message);return true;}catch(e){setError(e instanceof Error?e.message:"保存できませんでした。");return false;}finally{setBusy(false);}};
  const f=<K extends keyof AdvancedSearch>(key:K,value:AdvancedSearch[K])=>setFilters(v=>({...v,[key]:value}));
  return <div className="procurement-tools">
    <div className="search-library"><div className="saved-search-buttons" aria-label="保存した検索条件">{searches.filter(s=>s.mode===mode).map(s=><div key={s.id}><button className="button secondary" onClick={()=>{onApply({...s,filters:simplifiedSearchFilters(s.filters)});setNotice(`「${s.name}」を適用しました。`);}}>{s.name}</button><button className="icon-button" disabled={busy} aria-label={`${s.name}の検索条件を削除`} onClick={()=>void action({action:"delete-search",id:s.id},"検索条件を削除しました。")}><Trash2 size={16}/></button></div>)}</div>
    <form className="save-search-line" onSubmit={e=>{e.preventDefault();void action({action:"save-search",search:{...current,name}},"検索条件を保存しました。").then(ok=>{if(ok)setName("");});}}><Input aria-label="保存する検索条件の名前" value={name} onChange={e=>setName(e.target.value)} maxLength={80} placeholder="例：AI研修・今月締切" required/><button className="button secondary" disabled={busy||!ready}><BookmarkPlus size={17}/>適用中の条件を保存</button></form></div>
    <details className="tool-disclosure search-filters"><summary><SlidersHorizontal size={18}/>詳しい検索条件</summary><form onSubmit={e=>{e.preventDefault();const parsed=advancedSearchSchema.safeParse(filters);if(!parsed.success){setError(parsed.error.issues[0].message);return;}setError("");onApply({...current,filters:simplifiedSearchFilters(parsed.data)});}}>
      <fieldset className="prefecture-filter"><legend>都道府県別</legend>
        <details className="prefecture-picker"><summary>都道府県を選ぶ（複数選択可）<span>{selected.length?`${selected.length}件選択中`:"指定なし・全国"}</span></summary>
          <div className="prefecture-options">{prefectureGroups.map(group=><fieldset key={group.name}><legend>{group.name}</legend><div>{group.prefectures.map(prefecture=><label htmlFor={`${prefectureId}-${prefecture}`} key={prefecture}><Checkbox id={`${prefectureId}-${prefecture}`} checked={selected.includes(prefecture)} onCheckedChange={checked=>togglePrefecture(prefecture,checked===true)}/><span>{prefecture}</span></label>)}</div></fieldset>)}</div>
        </details>
        <div className="prefecture-selection" aria-live="polite"><p>{selected.length?selected.join("・"):"選択しない場合は全国を表示します。"}</p>{selected.length>0&&<button className="text-button" type="button" onClick={()=>f("region","")}>選択を解除</button>}</div>
      </fieldset>
      <fieldset className="deadline-filter"><legend>提出期限を設定</legend><div className="workbench-grid">
        <label>提出期限：開始<Input type="date" value={filters.deadlineFrom} max={filters.deadlineTo||undefined} onChange={e=>f("deadlineFrom",e.target.value)}/></label>
        <label>提出期限：終了<Input type="date" value={filters.deadlineTo} min={filters.deadlineFrom||undefined} onChange={e=>f("deadlineTo",e.target.value)}/></label>
      </div></fieldset>
      <p className="form-hint">選んだ都道府県のいずれかに該当する案件を表示します。提出期限は片方の日付だけでも指定できます。指定した地域・期限を確認できない案件は、絞り込み結果に含みません。</p>
      <div className="actions"><button className="button primary">この条件で絞り込む</button><button className="button secondary" type="button" onClick={()=>{const reset={...defaultAdvancedSearch,synonyms:current.filters.synonyms};setFilters(reset);setError("");onApply({...current,filters:reset});}}>詳細条件を解除</button></div>
    </form></details>
    <details className="tool-disclosure qualification-locked"><summary><ShieldCheck size={18}/>参加資格（固定）<span className="qualification-lock-badge"><LockKeyhole size={15} aria-hidden="true"/>変更不可</span></summary><div className="qualification-locked-body"><p className="form-hint">全省庁統一資格の条件は、フリーモードを含む全4モードで共通です。以下の固定等級を検索・照合に使用します。</p><dl className="qualification-fixed-grid">
      {qualificationCategories.map(c=><div key={c.key}><dt>{c.label}：等級</dt><dd>等級 {defaultQualificationGrades[c.key]}</dd></div>)}
      <div><dt>資格の有効期限</dt><dd className="qualification-fixed-expiry">{!ready?"確認中…":profile.qualificationUntil||"未設定（資格通知書で確認）"}</dd></div>
    </dl><p className="form-hint">等級・有効期限はこの画面から変更できません。資格の有効期間や参加地域・営業品目などは、資格通知書と公告原文で確認してください。</p></div></details>
    {error&&<p className="app-error" role="alert">{error}</p>}{notice&&<p className="workbench-success" role="status">{notice}</p>}
  </div>;
}

export function CandidateAssessment({item,profile}:{item:DiscoveryItem;profile:CompanyProfile}){
  return <div className="candidate-assessment"><p className="form-hint">「記載一致」は、参加資格全体を満たすという判定ではありません。原文と資格通知書を照合してください。</p>{assessCandidate(item,profile).map(c=><div className="condition-row" key={c.label}><strong>{c.label}<span className={`condition-state ${c.state}`}>{c.state==="match"?"記載一致":c.state==="attention"?"注意":"要確認"}</span></strong><p>{c.detail}</p>{c.evidence&&<blockquote>{c.evidence}</blockquote>}</div>)}</div>;
}

function CandidateHistory({item}:{item:DiscoveryItem}){
  const [history,setHistory]=useState<{deadline:string;title:string;recordedAt:number;deadlineEvidence?:string}[]|null>(null),[error,setError]=useState("");
  return <details className="candidate-history" onToggle={e=>{if(e.currentTarget.open&&history===null)void workbenchRequest<{history:NonNullable<typeof history>}>(`/api/procurement-workbench?history=${item.id}`).then(r=>{setHistory(r.history);setError("");}).catch(e=>setError(e.message));}}><summary>取得後の変更履歴</summary>{error?<p role="alert">{error}</p>:history===null?<p>確認中…</p>:history.length?history.map((h,i)=><div className="history-entry" key={i}><strong>{new Date(h.recordedAt).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})} に更新を検知</strong><p>変更前の締切：{h.deadline||"未確認"}</p><p>{h.deadlineEvidence||h.title}</p></div>):<p>履歴保存の開始後、変更は記録されていません。公告に変更がないことを保証するものではありません。</p>}</details>;
}

function CandidateSummary({item}:{item:DiscoveryItem}){
  const fields=procurementBrief(item);
  const deadline=item.deadline?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return <>
    <dl className="candidate-deadline" data-unknown={!item.deadline}><dt>入札・見積の締切</dt><dd>{deadline?<time dateTime={item.deadline}>{deadline[1]}年{Number(deadline[2])}月{Number(deadline[3])}日</time>:item.deadline||"未確認"}<small>{item.deadline?"締切時刻は公式公告で確認してください。":"公式公告で提出期限を確認してください。"}</small></dd></dl>
    <dl className="candidate-summary-fields">{fields.filter(field=>["仕事内容","資格条件"].includes(field.label)).map(field=><div key={field.label}><dt>{field.label==="資格条件"?"参加資格":field.label}</dt><dd>{field.value}</dd></div>)}</dl>
  </>;
}

export function CandidateSheet({item,profile,onClose,onManage,today,renderActions,actionError,detailError,onRetry}:{item:DiscoveryItem|null;profile:CompanyProfile;onClose:()=>void;onManage?:(item:DiscoveryItem)=>void;today?:string;renderActions?:(item:DiscoveryItem)=>ReactNode;actionError?:string;detailError?:string;onRetry?:()=>void}){
  return <Sheet open={!!item} onOpenChange={open=>{if(!open)onClose();}}><SheetContent className="candidate-sheet"><SheetHeader><SheetTitle>案件の詳細</SheetTitle><SheetDescription>参加条件・提出期限は、公式公告で最終確認してください。</SheetDescription></SheetHeader>{item&&<div className="candidate-sheet-body" key={item.id}>
    <div className="candidate-heading"><OpportunityType item={item}/><h2>{item.title}</h2><p className="candidate-agency"><span>募集機関名</span>{item.agency || "未確認"}</p>
      <div className="candidate-status">{item.updatedSinceReview&&<span>更新あり</span>}{item.review==="reviewed"&&<span>確認済み</span>}{item.review==="dismissed"&&<span>対象外</span>}{item.registered&&<span>登録済み</span>}</div>
    </div>
    {item.retrievalIssue&&<p className="app-error">再取得に失敗したため、前回保存した情報です。公告原文で最新の内容を確認してください。</p>}
    {item.withdrawalEvidence&&<p className="app-error">中止・取消に関する記載があります：{item.withdrawalEvidence}</p>}
    {today&&item.deadline&&item.deadline<=today&&<p className="app-error">入札・見積締切が本日以前の案件です。</p>}
    {today&&item.milestones?.some(m=>m.date<=today)&&<p className="app-error">先行手続きの期限が到来しています。手続きの状況を確認してください。</p>}
    {item.previewOnly?<div aria-live="polite">{detailError?<p className="app-error" role="alert">{detailError}<button type="button" className="text-button" onClick={onRetry}>再読み込み</button></p>:<p role="status">案件の詳細を読み込んでいます…</p>}</div>:<>
    <CandidateSummary item={item}/>
    <section className="candidate-fit" aria-label="対応分野と参加条件"><h3>対応分野と参加条件</h3><dl>
      <div><dt>技術・業務の適合</dt><dd>{item.matchedKeywords?.length?`検索語に一致：${item.matchedKeywords.slice(0,6).join("、")}`:"検索条件に合う候補"}<small>仕様・工数・納期・保守体制を担当者が確認してください。</small></dd></div>
      <div><dt>入札への参加可否</dt><dd>要確認<small>登録資格・所在地・法人実績・再委託・提出期限を原文と照合してください。「確認済み」は閲覧管理の状態です。</small></dd></div>
    </dl></section>
    <a data-tour="official-link" className="button primary candidate-official-link" href={item.officialUrl} target="_blank" rel="noopener noreferrer">公式公告を開く<ArrowUpRight size={19} aria-hidden="true"/></a>
    <div className="candidate-disclosures">
      <details className="candidate-disclosure"><summary>提出方法・事前手続き・場所</summary><div className="candidate-disclosure-body"><OpportunityBrief item={item} labels={["先に必要な手続き","提出方法（原文抜粋）","履行・納品場所"]}/></div></details>
      <details className="candidate-disclosure"><summary>参加条件を詳しく照合する</summary><div className="candidate-disclosure-body"><CandidateAssessment item={item} profile={profile}/></div></details>
      <details className="candidate-disclosure"><summary>公告の原文・出典・変更履歴</summary><div className="candidate-disclosure-body candidate-reference">
        <DiscoveryProvenance item={item}/><CandidateHistory item={item}/>
        <details><summary>要点の根拠を見る</summary><dl className="candidate-evidence">{procurementBrief(item).filter(field=>["仕事内容","資格条件","入札・見積締切"].includes(field.label)&&field.evidence).map(field=><div key={field.label}><dt>{field.label}</dt><dd>{field.evidence}</dd></div>)}</dl></details>
        <details><summary>取得できた公告本文</summary><p className="notice-original">{item.descriptionText||item.summary||"本文は未取得です。"}</p></details>
        {(item.reasons?.length||item.expandedMatches?.length)?<details><summary>検索条件に一致した理由</summary><div className="opportunity-match"><p>{item.reasons?.find(reason=>!reason.startsWith("言い換え："))}</p><SynonymReasons item={item}/></div></details>:null}
      </div></details>
    </div>
    {(renderActions||onManage)&&<section className="candidate-followup" aria-label="確認後の操作"><h3>内容を確認したら</h3>{actionError&&<p className="app-error" role="alert">{actionError}</p>}{renderActions&&<div className="candidate-primary-actions">{renderActions(item)}{item.reviewReason&&<p>対象外の理由：{item.reviewReason}</p>}</div>}{onManage&&<details className="candidate-manage"><summary>ポータル内で案件を管理する</summary><p>必要書類・作業・期限を記録できます。Larkへの登録とは別の操作です。</p><button className="button secondary" onClick={()=>onManage(item)}>案件・提出管理へ追加</button></details>}</section>}
    </>}
    <button type="button" className="button secondary candidate-close" onClick={onClose}>閉じる</button>
  </div>}</SheetContent></Sheet>;
}
