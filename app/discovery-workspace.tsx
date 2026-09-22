"use client";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OpportunityActions, OpportunityCards } from "./opportunity-cards";
import { keywordGroups } from "@/lib/procurement-synonyms";
import { OpportunityTable } from "./opportunity-table";
import GsdfSearchScope from "./gsdf-search-scope";
import MsdfSearchScope from "./msdf-search-scope";
import AsdfSearchScope from "./asdf-search-scope";
import { SearchTools, CandidateSheet } from "./procurement-tools";
import { advancedSearchSchema, defaultAdvancedSearch, emptyCompanyProfile, type AdvancedSearch, type CompanyProfile, type SavedSearchInput } from "@/lib/procurement-workbench";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import { ArrowUpRight,ChevronDown,ChevronLeft,ChevronRight,RefreshCw,Search,Sparkles,Pause,LoaderCircle,SlidersHorizontal } from "lucide-react";
import { searchModes, defaultLarkMode, type CollectionMode, type LarkMode } from "@/lib/collection-profiles";
import { procurementSources,type ProcurementSourceId } from "@/lib/procurement-sources";
import { resultCategories,type ResultCategory } from "@/lib/procurement-classification";
import { splitKeywords,discoveryTerms,discoveryPageSize,candidateBucket,groupDiscoveryFeed,type DiscoveryBucket,type DiscoveryFeed,type DiscoveryItem,type DiscoveryProgress } from "@/lib/discovery-domain";
import { larkCandidateIdentity } from "@/lib/lark-registration";
import { useLarkRegistration,LarkRegistrationAction } from "./lark-registration";

const views:{id:DiscoveryBucket;label:string;hint:string}[]=[
  {id:"all",label:"全件",hint:"適用中の条件に合うすべての保存案件"},
  {id:"recommended",label:"おすすめ・新着",hint:"件名が希望の仕事に合う候補"},
  {id:"related",label:"関連候補",hint:"公告本文でキーワードが一致"},
  {id:"attention",label:"要確認",hint:"期限・条件の確認が必要"},
  {id:"reviewed",label:"確認済み・Lark登録済み",hint:"ご自身の確認履歴・登録履歴"},
];
const sourceTitles:Record<ProcurementSourceId,string>={
  kkj:"官公需情報｜国・自治体", "p-portal":"調達ポータル｜公式サイト検索", mod:"防衛省｜省内・自衛隊", gsdf:"陸上自衛隊｜駐屯地・部隊", msdf:"海上自衛隊｜基地・部隊", asdf:"航空自衛隊｜基地・契約機関",
};
const sourceDescriptions:Record<ProcurementSourceId,string>={
  kkj:"官公需APIから収録公告を取得",
  "p-portal":"外部サイトで手動検索・自動取り込み未接続",
  mod:"官公需の防衛省案件＋省内の公式公告を取得",
  gsdf:"公式の調達案内から公告・見積依頼を巡回取得",
  msdf:"公式の調達案内から各部隊の公告を巡回取得",
  asdf:"公式の調達案内から各契約機関の公告を巡回取得",
};
function sourceActivity(id:ProcurementSourceId,progress?:DiscoveryProgress){
  if(id==="p-portal")return "自動取得：未接続";
  const names:Record<string,string>={kkj:"官公需 API",mod:"防衛省 公式公告",gsdf:"陸上自衛隊",msdf:"海上自衛隊",asdf:"航空自衛隊"};
  const sources=progress?.sources.filter(s=>s.name===names[id]||(id==="mod"&&s.name==="官公需 API"))??[];
  if(!sources.length)return "";
  if(sources.some(s=>s.issues.length||s.pageIssues?.length))return "直近の取得：未確認・エラーあり";
  if(sources.some(s=>s.pending>0))return progress?.status==="running"?"取得状況：処理中":"取得状況：未完了";
  return sources.some(s=>s.processed>0)?"直近の取得：処理完了（全件保証なし）":"";
}
const dateTime=(value?:number)=>value?new Date(value).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}):"未取得";
async function request<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T> {
  const controller=new AbortController();
  const abort=()=>controller.abort(signal?.reason);
  signal?.addEventListener("abort",abort,{once:true});
  if(signal?.aborted)abort();
  // Official-page retrieval takes longer than reading saved search results.
  const isStep=!!body&&typeof body==="object"&&"action" in body&&body.action==="step";
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},isStep?90000:30000);
  try {
    const r=await fetch(path,{method:body?"POST":"GET",cache:"no-store",signal:controller.signal,...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
    const data=await r.json() as T & {error?:string;code?:string};if(!r.ok){if(r.status===401||data.code==="membership")window.dispatchEvent(new CustomEvent("portal-access-denied",{detail:{status:r.status,code:data.code,message:data.error||"利用状況を確認できませんでした。"}}));throw new Error(data.error||"取得できませんでした。");}return data;
  }catch(e){
    if(timedOut)throw new Error(isStep?"公告の取得に時間がかかっているため、この画面での待機を中断しました。「検索」で保存済みの案件を確認できます。取得の再開は「最新情報を取得」を押してください。":"通信の応答を確認できませんでした。少し時間をおいて「検索」または「再読み込み」を押してください。");
    throw e;
  }finally{clearTimeout(timer);signal?.removeEventListener("abort",abort);}
}
export function DiscoveryWorkspace({mode,compact=false,onKeywords,onOpen,onStatus,onManage,initialKeyword=""}:{mode:CollectionMode;compact?:boolean;onKeywords?:()=>void;onOpen?:()=>void;onStatus?:(mode:CollectionMode,feed:DiscoveryFeed,source:ProcurementSourceId|"all",collecting:boolean)=>void;initialKeyword?:string;onManage?:(item:DiscoveryItem,mode:CollectionMode)=>void}) {
  const isFree=mode==="free";
  const [freeLarkMode,setFreeLarkMode]=useState<LarkMode>("free");
  const registrationMode=isFree?freeLarkMode:defaultLarkMode(mode);
  const [source,setSource]=useState<ProcurementSourceId|"all">("all"),[bucket,setBucket]=useState<DiscoveryBucket>(isFree?"all":"recommended"),[category,setCategory]=useState<ResultCategory>("all");
  const [draft,setDraft]=useState(initialKeyword),[keywords,setKeywords]=useState(initialKeyword),[exclude,setExclude]=useState(""),[newOnly,setNewOnly]=useState(false),[offset,setOffset]=useState(0);
  const [feed,setFeed]=useState<DiscoveryFeed|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false),[running,setRunning]=useState(false),[reviewBusy,setReviewBusy]=useState("");
  const [reason,setReason]=useState(""),[actionError,setActionError]=useState("");
  const [confirmedDate,setConfirmedDate]=useState(""),[evidence,setEvidence]=useState("");
  const [filters,setFilters]=useState<AdvancedSearch>(()=>({...defaultAdvancedSearch,synonyms:isFree?"off":"on"})),[profile,setProfile]=useState<CompanyProfile>(emptyCompanyProfile),[assessItem,setAssessItem]=useState<DiscoveryItem|null>(null);
  const resultsPanel=useRef<HTMLDetailsElement>(null);
  const showResults=()=>resultsPanel.current?.setAttribute("open","");
  const applySearch=(value:Omit<SavedSearchInput,"name">)=>{showResults();setSource(value.source);setCategory(value.category);setDraft(value.keywords);setKeywords(value.keywords);setExclude(value.exclude);setNewOnly(value.newOnly);setFilters(advancedSearchSchema.parse(value.filters));setOffset(0);setBucket("all");};
  const [resultLayout,setResultLayout]=useState("cards");
  const expanded=useMemo(()=>keywordGroups(keywords?splitKeywords(keywords):discoveryTerms[mode],filters.synonyms!=="off").filter(group=>group.terms.length>1),[keywords,mode,filters.synonyms]);
  const alive=useRef(true),stepBusy=useRef(false),feedRequest=useRef(0),startBusy=useRef(false);
  const [starting,setStarting]=useState(false);
  const [runId,setRunId]=useState("");
  const runRef=useRef<{id:string;endsAt:number}|null>(null);
  const [inspection,setInspection]=useState<DiscoveryProgress["inspection"]>();
  const collectionState=useRef<DiscoveryProgress|undefined>(undefined);
  const [collectionError,setCollectionError]=useState("");
  const [candidateLimit,setCandidateLimit]=useState(100);
  const searchStarted=useRef<number|null>(null);
  const detailCache=useRef(new Map<string,DiscoveryItem>()),detailRequest=useRef<AbortController|null>(null);
  const [detailError,setDetailError]=useState("");
  const visibleFeed=useMemo(()=>feed?groupDiscoveryFeed(feed,category,bucket,offset):null,[feed,category,bucket,offset]);
  const pageOffset=visibleFeed?.offset??offset;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;detailRequest.current?.abort();};},[]);
  const params=useMemo(()=>new URLSearchParams({...filters,mode,larkMode:registrationMode,source,bucket:"all",category:"all",keywords,exclude,newOnly:newOnly?"1":"0",offset:"0",candidateLimit:String(candidateLimit),includePool:"1"}).toString(),[mode,registrationMode,source,keywords,exclude,newOnly,filters,candidateLimit]);
  const reload=useCallback(async(signal?:AbortSignal)=>{
    const requestId=++feedRequest.current;setLoading(true);
    try{const data=await request<DiscoveryFeed>(`/api/discovery?${params}`,undefined,signal);if(!signal?.aborted&&alive.current&&requestId===feedRequest.current){detailCache.current.clear();setFeed({...data,progress:collectionState.current??data.progress});setError("");}}
    catch(e){if(!signal?.aborted&&alive.current&&requestId===feedRequest.current){setError(e instanceof Error?e.message:"取得できませんでした。");}}
    finally{if(alive.current&&requestId===feedRequest.current)setLoading(false);}
  },[params]);
  useEffect(()=>{const controller=new AbortController();setFeed(null);void reload(controller.signal);return()=>controller.abort();},[reload]);
  const latestReload=useRef(reload);
  useEffect(()=>{latestReload.current=reload;},[reload]);
  const currentFeed=useRef({feed});
  useEffect(()=>{currentFeed.current={feed};if(feed)onStatus?.(mode,feed,source,running);},[feed,mode,source,onStatus,running]);
  useEffect(()=>{
    const run=runRef.current;if(!running||!run)return;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    // The server enforces the same deadline. This also bounds the visible wait
    // if the connection is lost while the server is saving its final response.
    const deadline=setTimeout(()=>{
      setInspection(current=>current?.id===run.id?{...current,reason:"time"}:current);
      setRunning(false);showResults();void latestReload.current();
    },Math.max(1,run.endsAt-Date.now()));
    const schedule=(delay:number)=>{if(!controller.signal.aborted)timer=setTimeout(advance,delay);};
    const advance=async()=>{
      if(controller.signal.aborted)return;
      if(stepBusy.current){schedule(1000);return;}
      stepBusy.current=true;let again=true,delay=5000;
      try{
        const result=await request<{progress:DiscoveryProgress;waiting?:boolean}>("/api/discovery",{action:"step",mode,runId:run.id},controller.signal);
        if(controller.signal.aborted)return;
        const current=currentFeed.current,progress=result.progress;
        collectionState.current=progress;
        setInspection(progress.inspection);
        if(progress.inspection?.reason){showResults();await latestReload.current(controller.signal);again=false;setRunning(false);return;}
        if(current.feed&&progress.status==="running"&&progress.saved===current.feed.progress.saved&&progress.resultRevision===current.feed.progress.resultRevision){
          setFeed({...current.feed,progress});
        }else await latestReload.current(controller.signal);
        again=progress.status==="running";
        if(!again)setRunning(false);
        delay=result.waiting?5000:Math.max(1000,Math.min(6500,(progress.nextAt??Date.now()+5000)-Date.now()));
      }catch(e){again=false;if(!controller.signal.aborted){setCollectionError(e instanceof Error?e.message:"取得が停止しました。");setRunning(false);}}
      finally{stepBusy.current=false;if(again)schedule(delay);}
    };
    void advance();return()=>{controller.abort();clearTimeout(timer);clearTimeout(deadline);};
  },[running,mode,runId]);
  const items=useMemo(()=>visibleFeed?.items??[],[visibleFeed]);
  const larkItems=useMemo(()=>assessItem&&!assessItem.previewOnly?[assessItem]:[],[assessItem]);
  const lark=useLarkRegistration(registrationMode,larkItems);
  const collectionFailed=feed?.progress.status==="failed"||inspection?.reason==="error";
  const progressMessage=feed?.progress.message?.replace(/一部の取得先・検索条件は未確認です。?/g, "").trim();
  const officialSearch=source==="gsdf"||source==="msdf"||source==="asdf";
  const sourcePrep=source==="p-portal";
  const choose=<T,>(setter:(value:T)=>void,value:T)=>{setter(value);setOffset(0);};
  const searchSaved=()=>{
    if(isFree&&!splitKeywords(draft).length)return;
    showResults();searchStarted.current=performance.now();setCandidateLimit(100);setBucket("all");setCategory("all");setOffset(0);
    if(draft===keywords&&candidateLimit===100)void reload();
    else choose(setKeywords,draft);
  };
  useEffect(()=>{
    if(loading||!feed||searchStarted.current===null)return;
    // Local browser measurement includes API latency and React rendering.
    // No search text or member data is sent to analytics.
    const start=searchStarted.current;searchStarted.current=null;
    const frame=requestAnimationFrame(()=>performance.measure?.("portal-search-to-cards",{start,end:performance.now()}));
    return()=>cancelAnimationFrame(frame);
  },[loading,feed]);
  const start=async()=>{
    if(running||startBusy.current||sourcePrep||(isFree&&!splitKeywords(draft).length))return;
    showResults();startBusy.current=true;setStarting(true);setInspection(undefined);setCollectionError("");choose(setKeywords,draft);setBucket("all");
    const search=new URLSearchParams({...filters,mode,source,keywords:draft,exclude,newOnly:newOnly?"1":"0"}).toString();
    try{
      const result=await request<{runId:string;progress:DiscoveryProgress}>("/api/discovery",{action:"start",mode,keywords:draft.trim()?draft:discoveryTerms[mode].join("、"),synonyms:filters.synonyms,source,batch:{search}});
      if(!result.progress.inspection||!result.runId)throw new Error("調査の開始を確認できませんでした。画面を再読み込みしてください。");
      collectionState.current=result.progress;runRef.current={id:result.runId,endsAt:result.progress.inspection.endsAt};
      setRunId(result.runId);setFeed(current=>current?{...current,progress:result.progress}:current);setInspection(result.progress.inspection);setRunning(result.progress.status==="running");
    }catch(e){setCollectionError(e instanceof Error?e.message:"開始できませんでした。");}finally{startBusy.current=false;setStarting(false);}
  };
  const pause=async()=>{
    setRunning(false);const run=runRef.current;if(!run)return;
    setInspection(current=>current?{...current,reason:"stopped"}:current);
    try{const result=await request<{progress:DiscoveryProgress}>("/api/discovery",{action:"pause",mode,runId:run.id});collectionState.current=result.progress;setInspection(result.progress.inspection);await reload();}
    catch(e){setCollectionError(e instanceof Error?e.message:"停止操作を再度お試しください。");}
  };
  const review=async(item:DiscoveryItem,state:"new"|"reviewed"|"dismissed")=>{setReviewBusy(item.id);setActionError("");try{await request("/api/discovery",{action:"review",id:item.id,mode,state,reason:state==="dismissed"?reason:""});setReason("");setAssessItem(current=>current?.id===item.id?{...current,review:state,updatedSinceReview:false,reviewReason:state==="dismissed"?reason:""}:current);await reload();}catch(e){setActionError(e instanceof Error?e.message:"保存できませんでした。");}finally{setReviewBusy("");}};
  const openDetails=(item:DiscoveryItem)=>{
    detailRequest.current?.abort();setDetailError("");setActionError("");setReason("");setConfirmedDate(item.deadline||"");setEvidence("");
    const key=params+"|"+item.id+"|"+(item.fingerprint??"");
    const loaded=feed?.items.find(value=>value.id===item.id&&value.fingerprint===item.fingerprint)??detailCache.current.get(key);
    if(!item.previewOnly||loaded){setAssessItem(loaded??item);return;}
    setAssessItem(item);const controller=new AbortController();detailRequest.current=controller;
    const detailParams=new URLSearchParams(params);detailParams.set("includePool","0");detailParams.set("itemId",item.id);
    void request<DiscoveryFeed>(`/api/discovery?${detailParams}`,undefined,controller.signal).then(data=>{
      if(controller.signal.aborted||!alive.current)return;
      const full=data.items.find(value=>value.id===item.id);
      if(!full)throw new Error("案件の条件が更新されています。検索結果を更新して確認してください。");
      if(detailCache.current.size>=24)detailCache.current.clear();detailCache.current.set(key,full);
      setAssessItem(full);setConfirmedDate(full.deadline||"");
    }).catch(error=>{if(!controller.signal.aborted&&alive.current)setDetailError(error instanceof Error?error.message:"詳細を読み込めませんでした。");});
  };
  const closeDetails=()=>{detailRequest.current?.abort();setAssessItem(null);setDetailError("");};
  const confirmDeadline=async(item:DiscoveryItem)=>{setReviewBusy(item.id);setActionError("");try{await request("/api/discovery",{action:"confirm-deadline",mode,id:item.id,deadline:confirmedDate,evidence});setAssessItem(null);setConfirmedDate("");setEvidence("");await reload();}catch(e){setActionError(e instanceof Error?e.message:"期限を保存できませんでした。");}finally{setReviewBusy("");}};
  return <div className="discovery-workspace" data-mode={mode}>
    {!compact&&<details className="panel discovery-search discovery-panel" open={isFree}>
      <summary className="discovery-panel-heading"><h2>どんな仕事を探しますか？</h2><span className="discovery-panel-toggle" aria-hidden="true"><span className="when-closed">開く</span><span className="when-open">閉じる</span><ChevronDown size={22}/></span></summary>
      <div className="discovery-panel-body">
      {isFree&&<p className="free-search-note">キーワードは自由に入力できます。参加資格・等級条件は、ほかのモードと同じ固定条件を適用します。</p>}
      <div className="discovery-panel-actions"><button type="button" className="text-button" onClick={onKeywords}>検索キーワード集<ArrowUpRight size={17}/></button></div>
      <form className="discovery-search-flow" onSubmit={e=>{e.preventDefault();searchSaved();}}>
        <div className="discovery-keyword-step"><label htmlFor={`collection-keywords-${mode}`}>検索キーワード</label>
          <div data-tour="keywords" className="discovery-search-line"><input id={`collection-keywords-${mode}`} value={draft} maxLength={4000} onChange={e=>setDraft(e.target.value)} required={isFree} placeholder={isFree?"探したい仕事や物品名を入力（例：医療機器、翻訳）":discoveryTerms[mode].slice(0,6).join("、")}/>{!isFree&&<button type="button" className="button secondary" onClick={()=>setDraft(discoveryTerms[mode].join("、"))}><Sparkles size={18}/>キーワードを自動生成</button>}</div>
        </div>
      <details data-tour="sources" id={`collection-sources-${mode}`} tabIndex={-1} className="tool-disclosure discovery-source-select">
        <summary><span className="discovery-source-title">検索先を選ぶ</span><span className="discovery-source-current">選択中：<strong>{source==="all"?"取得済み案件｜全検索先":sourceTitles[source]}</strong></span></summary>
        <div className="discovery-source-body">
          <p className="discovery-note">{sourcePrep?"調達ポータルは自動検索の準備中です。下の「公式サイトで検索」から調べられます。":"検索先を1つ選び、下の「検索」を押してください。"}</p>
          <div className="discovery-source-grid" role="group" aria-label="検索先を選ぶ">
            <button type="button" aria-pressed={source==="all"} onClick={()=>choose(setSource,"all")}><span className="discovery-source-name"><strong>取得済み案件｜全検索先</strong>{source==="all"&&<span className="discovery-source-badge">選択中</span>}</span><small>接続済みの取得先から保存した案件を横断検索</small><small className="source-activity">保存済み案件の表示・調達ポータルは含みません</small></button>
            {procurementSources.map(s=><button type="button" key={s.id} aria-pressed={source===s.id} onClick={()=>choose(setSource,s.id)}><span className="discovery-source-name"><strong>{sourceTitles[s.id]}</strong>{source===s.id&&<span className="discovery-source-badge">選択中</span>}</span><small>{sourceDescriptions[s.id]}</small>{sourceActivity(s.id,feed?.progress)&&<small className="source-activity">{sourceActivity(s.id,feed?.progress)}</small>}</button>)}
          </div>
        </div>
      </details>
        <div className="discovery-toolbar discovery-start-row">{sourcePrep?<a className="button primary" href={procurementSources.find(s=>s.id===source)?.href} target="_blank" rel="noopener noreferrer">公式サイトで検索<ArrowUpRight size={18}/></a>:<>
          <button data-tour="saved-search" className="button primary discovery-start-button" type="submit" disabled={loading||(isFree&&!splitKeywords(draft).length)}>{loading?<LoaderCircle className="spin" size={20}/>:<Search size={20}/>} {loading?"検索中…":"検索"}</button>
          <button data-tour="collect" className="button secondary discovery-refresh-button" type="button" disabled={running||starting||(isFree&&!splitKeywords(draft).length)} onClick={()=>void start()}>{running||starting?<LoaderCircle className="spin" size={18}/>:<RefreshCw size={18}/>} {starting?"取得を開始しています…":running?"最新情報を取得中…":"最新情報を取得"}</button>
          {running&&<button type="button" className="button secondary" onClick={pause}><Pause size={16}/>取得を停止</button>}
        </>}<span>保存済みの案件を検索し、12件ずつ表示します。</span></div>
        {collectionError&&<p className="app-error" role="alert">{collectionError} 保存済みの案件は「検索」で確認できます。</p>}
      </form>
      {officialSearch&&<p className="discovery-note">各基地・部隊の公式公告・見積依頼・添付PDFを順に調べます。新しい公告を取得する間は画面を開いてください。保存済みの結果は先に確認できます。取得先と未確認のページは「設定・仕様」の「公告の取得状況」で確認できます。</p>}
      <details className="tool-disclosure discovery-search-options">
        <summary><SlidersHorizontal size={18} aria-hidden="true"/>検索オプション</summary>
        <div className="discovery-search-options-body">
      <div className="synonym-search"><div className="synonym-switch"><Switch id={`synonyms-${mode}`} checked={filters.synonyms!=="off"} onCheckedChange={checked=>{setFilters(value=>({...value,synonyms:checked?"on":"off"}));setOffset(0);}}/><label htmlFor={`synonyms-${mode}`}>言い換えを含める</label><span>{filters.synonyms!=="off"?"関連する表現も検索":"入力した語句のみ"}</span></div>{filters.synonyms!=="off"&&<details><summary>現在の検索で含める表現{expanded.length?`（${expanded.length}語）`:""}</summary>{expanded.length?<ul>{expanded.map(group=><li key={group.input}><strong>{group.input}</strong><span> → {group.terms.slice(1).join("、")}</span></li>)}</ul>:<p>この語句に登録された言い換えはありません。入力した語句で検索します。</p>}<small>言い換えには関連語を含みます。資格や参加可否の判定は、公告の条件に基づきます。</small></details>}</div>
      <SearchTools mode={mode} current={{mode,source,category,keywords,exclude,newOnly,filters}} onApply={applySearch} onProfile={setProfile}/>
        </div>
      </details>
      {source==="gsdf"&&<GsdfSearchScope/>}
      {source==="msdf"&&<MsdfSearchScope/>}
      {source==="asdf"&&<AsdfSearchScope/>}
      </div>
    </details>}
    <details ref={resultsPanel} id={`collection-results-${mode}`} tabIndex={-1} className="panel discovery-results discovery-panel" aria-busy={loading}>
      <summary data-tour="results-heading" className="discovery-panel-heading"><h2><span className="eyebrow">YOUR OPPORTUNITIES</span>調査結果一覧</h2><span className="discovery-panel-status">{loading?"保存済みを検索中…":feed?`${visibleFeed?.total??0}件${running?" · 公告を追加取得中":""}`:error?"読み込みエラー":""}</span><span className="discovery-panel-toggle" aria-hidden="true"><span className="when-closed">開く</span><span className="when-open">閉じる</span><ChevronDown size={22}/></span></summary>
      <div className="discovery-panel-body">
      {compact&&<div className="discovery-panel-actions"><button className="button primary" onClick={onOpen}>案件を探す<ArrowUpRight size={18}/></button></div>}
      {error&&<p className="app-error" role="alert">{error} 保存した案件が0件という意味ではありません。<button className="text-button" onClick={()=>void reload()}>再読み込み</button></p>}
      {sourcePrep?<div className="discovery-empty"><h3>自動検索は準備中です</h3><p>このサイトの自動取得は行っていません。公式サイトを開いて検索できます。</p><a className="button secondary" href={procurementSources.find(s=>s.id===source)?.href} target="_blank" rel="noopener noreferrer">公式サイトを開く<ArrowUpRight size={18}/></a></div>:<>
      {inspection&&<p className="discovery-note" role="status"><strong>公告の確認：{inspection.inspected}／{inspection.limit}件</strong> · {inspection.reason?({limit:"100件の確認を終えました。",time:"60秒で調査を一区切りにしました。",complete:"今回の取得を終えました。",error:"取得できない公告があり、調査を停止しました。",stopped:"調査を停止しました。"})[inspection.reason]:"確認中です。"}{inspection.reason&&"見つかった候補を下に表示します。追加取得は「最新情報を取得」を押してください。"}</p>}
      {collectionFailed&&<div className="app-error" role="alert"><strong>公告を取得できていない検索条件があります</strong><p>{progressMessage}</p>{feed?.progress.retryable&&<button className="button secondary" disabled={running} onClick={start}><RefreshCw size={16}/>公告の取得を再試行</button>}{!!feed?.progress.retryAt&&<p>未取得の検索条件は {dateTime(feed.progress.retryAt)} 以降に再試行できます。</p>}</div>}
      <p className="discovery-note">国・自治体の案件を検索します。自治体案件は「要確認」に表示し、確認済みにした案件は「確認済み・Lark登録済み」で確認できます。参加可否は詳細の条件と原文で判断してください。</p>
      <div data-tour="result-views" className="discovery-views" aria-label="調査結果の表示">{views.map(v=><button type="button" key={v.id} aria-pressed={bucket===v.id} title={v.hint} onClick={()=>choose(setBucket,v.id)}>{v.label}<span>{visibleFeed?.counts[v.id]??"—"}</span></button>)}</div>
      <div className="discovery-filters"><div className="discovery-categories" aria-label="契約条件">{resultCategories.map(c=><button type="button" key={c.id} data-category={c.id} aria-pressed={category===c.id} onClick={()=>choose(setCategory,c.id)}>{c.label}</button>)}</div><label><input type="checkbox" checked={newOnly} onChange={e=>choose(setNewOnly,e.target.checked)}/>新着7日・確認後の更新</label></div>
      {feed?.candidateLimitReached&&<p className="discovery-note">条件に合う候補を{feed.counts.all}件まで表示しています。{candidateLimit<20000&&<button type="button" className="text-button" disabled={loading} onClick={()=>setCandidateLimit(value=>value+100)}>保存済みからさらに100件表示</button>}</p>}
      {!!feed?.truncated&&<p className="app-error">保存件数が多いため、条件に一致する保存案件のうち20,000件までを確認しています。さらに条件を絞ってください。表示は取得・確認できた範囲です。</p>}
      {!items.length?<div className="discovery-empty"><Search size={28}/><h3>{isFree&&!keywords.trim()?"キーワードを入力して検索してください":loading?"保存結果を読み込んでいます…":error?"検索結果を確認できません":`${views.find(v=>v.id===bucket)?.label}に表示できる候補はありません`}</h3><p>{isFree&&!keywords.trim()?"仕事や物品名を自由に入力できます。複数の語句は読点「、」で区切ってください。":loading?"":error?"通信が回復したら、再読み込みしてください。":bucket==="recommended"?"「関連候補」「要確認」もご確認ください。収集が途中・未確認の取得先は「設定・仕様」の「公告の取得状況」で確認できます。":"条件を変えるか、「設定・仕様」の「公告の取得状況」をご確認ください。"}</p></div>:<Tabs value={resultLayout} onValueChange={setResultLayout} className="result-layout"><TabsList aria-label="案件の表示方法"><TabsTrigger value="cards">カード</TabsTrigger><TabsTrigger value="table">一覧表</TabsTrigger></TabsList><TabsContent value="cards"><OpportunityCards summaryOnly items={items} today={feed?.today??""} busyId={reviewBusy} onDetails={openDetails} onReview={item=>void review(item,item.review==="new"||item.updatedSinceReview?"reviewed":"new")} renderRegistration={item=><><LarkRegistrationAction destination={lark.destination} mode={registrationMode} item={item} state={lark.rows[larkCandidateIdentity(item)]} disabled={!lark.configured||lark.checking||!item.deadline||candidateBucket(item,feed?.today)==="attention"||candidateBucket(item,feed?.today)==="closed"} onRegister={()=>void lark.register(item).then(()=>reload())}/>{candidateBucket(item,feed?.today)==="attention"&&<small>締切・条件の確認後に登録してください。</small>}</>}/></TabsContent><TabsContent value="table"><OpportunityTable items={items} onDetails={openDetails}/></TabsContent></Tabs>}
      <div className="discovery-pagination"><span>{visibleFeed?.total?`${pageOffset+1}–${Math.min(pageOffset+discoveryPageSize,visibleFeed.total)} / ${visibleFeed.total}件`:feed?"0件":loading?"読み込み中…":"件数未確認"} · {({recommended:"一致順",deadline:"締切順",newest:"新着順",updated:"更新順"})[filters.sort]}</span><button className="button secondary" disabled={!pageOffset||loading} onClick={()=>setOffset(Math.max(0,pageOffset-discoveryPageSize))}><ChevronLeft size={16}/>前へ</button><button className="button secondary" disabled={!visibleFeed||pageOffset+discoveryPageSize>=visibleFeed.total||loading} onClick={()=>setOffset(pageOffset+discoveryPageSize)}>次の{discoveryPageSize}件<ChevronRight size={16}/></button></div>
      </>}
      </div>
    </details>
    <CandidateSheet detailError={detailError} onRetry={()=>{if(assessItem)openDetails(assessItem);}} actionError={actionError} item={assessItem} today={feed?.today} renderActions={item=><>
      {isFree&&<label className="free-lark-destination">Larkの保存先<NativeSelect value={registrationMode} onChange={e=>setFreeLarkMode(e.target.value as LarkMode)}>{searchModes.map(target=><option key={target.id} value={target.id}>{target.label}</option>)}</NativeSelect></label>}
      {!lark.configured&&!lark.checking&&lark.message&&<p className="discovery-note">{lark.message}</p>}
      <OpportunityActions item={item} busyId={reviewBusy} onReview={item=>void review(item,item.review==="new"||item.updatedSinceReview?"reviewed":"new")} renderRegistration={item=><><LarkRegistrationAction destination={lark.destination} mode={registrationMode} item={item} state={lark.rows[larkCandidateIdentity(item)]} disabled={!lark.configured||lark.checking||!item.deadline||candidateBucket(item,feed?.today)==="attention"||candidateBucket(item,feed?.today)==="closed"} onRegister={()=>void lark.register(item).then(()=>reload())}/>{candidateBucket(item,feed?.today)==="attention"&&<small>締切・条件の確認後に登録してください。</small>}</>}/>
      <details className="candidate-review-tools"><summary>期限の補足・対象外の設定</summary>
        {!item.deadline&&<div className="workbench-grid">
          <label>公式公告で確認した提出期限<input type="date" value={confirmedDate} onChange={e=>setConfirmedDate(e.target.value)}/></label>
          <label>公告の期限の記載<input value={evidence} maxLength={500} onChange={e=>setEvidence(e.target.value)} placeholder="例：見積書提出期限 令和8年9月25日17時"/></label>
          <button type="button" className="button secondary" disabled={reviewBusy===item.id||!confirmedDate||evidence.trim().length<5} onClick={()=>void confirmDeadline(item)}>期限を保存して確認済みにする</button>
        </div>}
        <div className="workbench-grid"><label>対象外の理由（任意）<input value={reason} maxLength={300} onChange={e=>setReason(e.target.value)} placeholder="例：対応地域外"/></label>
          <button type="button" className="button secondary" disabled={reviewBusy===item.id} onClick={()=>void review(item,"dismissed")}>対象外にする</button>
        </div>
      </details>
    </>} profile={profile} onClose={closeDetails} onManage={item=>{closeDetails();onManage?.(item,mode);}}/>
  </div>;
}
