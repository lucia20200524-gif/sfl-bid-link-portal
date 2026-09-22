import { fetchWithoutRedirects } from "./http-fetch";
import { db, ApiError } from "./server-store";
import { todayJst, dateOffset } from "./bid-domain";
import { allDiscoveryTerms, discoveryIdentity, norm, type DiscoveryItem, type DiscoveryProgress } from "./discovery-domain";
import { parseSearchResponse } from "./procurement-search";
import { boundedBytes } from "./defense-browser-client";
import { officialTransport, createOfficialTransport } from "./discovery-fetch";
import { newBrowserJob, addGsdfCatalog, addMsdfCatalog, addAsdfCatalog, advanceBrowserJob, resumePastDeniedPage, browserJobView, upgradeProcurementTraversal, applyGsdfExclusions, upgradePdfPageLimit } from "./defense-browser-engine";
import { parseOfficialHtml } from "./defense-browser-parser";
import { classifyProcurement } from "./procurement-classification";
import { type BrowserJob } from "./defense-browser-types";
import { defenseBrowserRules, type DefenseSourceId } from "./defense-browser-rules";
import { saveDiscovered } from "./discovery-store";

import type { CollectionMode } from "./collection-profiles";

type ApiTask={terms:string[];from?:string;to?:string;depth:number;count?:number};
type Inspection={id:string;signature:string;source:string;inspected:number;limit:number;endsAt:number;ids:string[];reason?:"limit"|"time"|"complete"|"stopped"|"error"};
type State={inspection?:Inspection;deferredMain?:DiscoveryItem[];status:"running"|"completed"|"paused"|"partial"|"failed";startedAt:number;updatedAt:number;nextAt:number;resultRevision?:number;processed:number;saved:number;message:string;api:ApiTask[];apiProcessed:number;apiIssues:string[];apiLimited:boolean;browsers:BrowserJob[];turn:number;mainPending:boolean;mainIssues:string[];mainProcessed:number;trigger:"manual"|"scheduled";knownTerms?:string[];failedApi?:ApiTask[];preferredSource?:DefenseSourceId};
const rowKey="shared-collection-v1";
const retryDelay=5*60000;
// v64 failed before any network request. Recover that exact legacy state once;
// do not apply this exception to an upstream rejection or a valid empty search.
function legacyTransportFailure(s:State){return s.saved===0&&s.status==="completed"&&s.apiIssues.length>0&&s.apiIssues.every(issue=>issue.includes("Invalid redirect value"));}
function hasIssues(s:State){return !!(s.apiIssues.length||s.mainIssues.length||s.browsers.some(b=>b.status==="paused"||b.limited||browserJobView(b).progress.targets.some(t=>t.state==="partial"||t.state==="failed")));}
function endMessage(s:State){return s.saved?"取得できた候補を保存しました。一部の取得先・検索条件は未確認です。":"公告の取得に失敗した検索条件があります。案件が存在しないという意味ではありません。取得状況をご確認ください。";}
function baseState(extra:string[],trigger:State["trigger"],source="all",mode:CollectionMode="sfl",requestedOnly=false):State {
  const terms=[...new Set([...extra,...(mode==="free"||requestedOnly?[]:allDiscoveryTerms)])],api:ApiTask[]=[];
  // Fewer OR terms per request lowers payloads. Start without a date filter so
  // older notices with a future closing date can also be discovered.
  for(let n=0;n<terms.length;n+=4)api.push({terms:terms.slice(n,n+4),depth:0});
  const browsers=(["gsdf","msdf","asdf"] as DefenseSourceId[]).map(source=>({...newBrowserJob(mode,source,terms,"fulltext"),retainUnknown:true}));
  return {status:"running",startedAt:Date.now(),updatedAt:Date.now(),nextAt:0,processed:0,saved:0,message:"共通の調査を開始しました。結果は取得できた順に保存します。",api,apiProcessed:0,apiIssues:[],apiLimited:false,browsers,turn:0,mainPending:true,mainIssues:[],mainProcessed:0,trigger,knownTerms:terms,preferredSource:source==="gsdf"||source==="msdf"||source==="asdf"?source:undefined};
}
export function splitApiTask(task:ApiTask):ApiTask[] {
  const from=task.from??"2000-01-01",to=task.to??todayJst();
  if(from<to) {
    const middle=new Date(Math.floor((Date.parse(from)+Date.parse(to))/2/86400000)*86400000).toISOString().slice(0,10);
    return [{...task,from:dateOffset(middle,1),to,depth:task.depth+1},{...task,from,to:middle,depth:task.depth+1}];
  }
  if(task.terms.length>1)return task.terms.map(term=>({...task,terms:[term],depth:task.depth+1}));
  return [];
}
function pending(state:State){return state.api.length+Number(state.mainPending)+state.browsers.reduce((n,b)=>n+b.queue.length+(b.deferredNotices?.length??0),0);}
function displayCollectionIssue(message:string){
  if(/internal error; reference =/.test(message))return "取得処理で通信エラーが発生しました。この条件は未確認です。時間をおいて再試行してください。";
  return /Cannot read properties of null.*textContent/.test(message)
    ? "前回の取得ではページを読み取れませんでした。公式ページで現在の掲載内容をご確認ください。"
    : message;
}
export async function collectionProgress(key=rowKey):Promise<DiscoveryProgress> {
  const row=await db().prepare("SELECT data FROM discovery_runtime WHERE key=?").bind(key).first<{data:string}>();
  const scheduler=await db().prepare("SELECT updated_at FROM discovery_runtime WHERE key='scheduler-heartbeat'").first<{updated_at:number}>();
  if(!row||row.data==="null")return {status:"idle",processed:0,pending:0,saved:0,message:"まだ収集していません。「最新情報を取得」で開始できます。",sources:[],schedulerLastRun:scheduler?.updated_at};
  const s:State=JSON.parse(row.data),legacy=legacyTransportFailure(s);
  if(s.inspection)stopInspection(s);
  s.browsers.forEach(applyGsdfExclusions);
  const status=legacy?"failed":s.status==="completed"&&hasIssues(s)?(s.saved?"partial":"failed"):s.status;
  return {status,startedAt:s.startedAt,updatedAt:s.updatedAt,nextAt:s.nextAt,resultRevision:s.resultRevision??0,processed:s.processed,pending:pending(s),saved:s.saved,
    inspection:s.inspection?{id:s.inspection.id,inspected:s.inspection.inspected,limit:s.inspection.limit,endsAt:s.inspection.endsAt,reason:s.inspection.reason}:undefined,
    message:legacy?"前回は通信設定の不具合で公告を取得できませんでした。修正済みです。「公告の取得を再試行」を押してください。":status!==s.status?endMessage(s):s.message,
    retryable:legacy||!!s.failedApi?.length,retryAt:legacy?0:s.failedApi?.length?s.updatedAt+retryDelay:undefined,schedulerLastRun:scheduler?.updated_at,
    sources:[{name:"官公需 API",processed:s.apiProcessed,pending:s.api.length,issues:s.apiIssues.map(displayCollectionIssue),officialUrl:"https://www.kkj.go.jp/s/"},
      {name:"防衛省 公式公告",processed:s.mainProcessed,pending:Number(s.mainPending),issues:s.mainIssues.map(displayCollectionIssue),officialUrl:"https://www.mod.go.jp/j/budget/chotatsu/naikyoku/mitsumori/index.html"},
      ...s.browsers.map(b=>({name:({gsdf:"陸上自衛隊",msdf:"海上自衛隊",asdf:"航空自衛隊"})[b.sourceId],processed:b.visited,pending:b.queue.length,
        officialUrl:defenseBrowserRules[b.sourceId].entryUrl,
        targets:browserJobView(b).progress.targets,
        pageIssues:[...(b.pageIssues??[]),...b.targets.flatMap((t,target)=>t.errors&&!b.pageIssues?.some(issue=>issue.target===target)?[{url:t.url??defenseBrowserRules[b.sourceId].entryUrl,title:t.name,target,message:"この確認先には未確認のページがあります。公式の案内から現在の掲載内容をご確認ください。"}]:[])],
        issues:[...(b.status==="paused"?[displayCollectionIssue(b.message)]:[]),...browserJobView(b).progress.targets.filter(t=>t.state==="partial"||t.state==="failed").map(t=>`${t.name}：${t.notes.map(displayCollectionIssue).join(" / ")||(t.limited?"取得上限・未確認あり":"公告の掲載内容を確認できていません")}`),...(b.limited?["取得範囲に上限があります"]:[])]}))]};
}
async function claim(key=rowKey) {
  const now=Date.now(),lease=crypto.randomUUID();
  await db().prepare("INSERT INTO discovery_runtime (key,data,lease,locked_until,updated_at) VALUES (?,'null','',0,?) ON CONFLICT(key) DO NOTHING").bind(key,now).run();
  const row=await db().prepare("UPDATE discovery_runtime SET lease=?,locked_until=? WHERE key=? AND locked_until<? RETURNING data").bind(lease,now+90000,key,now).first<{data:string}>();
  if(!row)throw new ApiError(409,"ほかの収集処理が実行中です。少し待つと続きから進みます。","collection_busy");
  return {lease,state:JSON.parse(row.data) as State|null};
}
async function commit(lease:string,state:State,key=rowKey) {await db().prepare("UPDATE discovery_runtime SET data=?,updated_at=?,locked_until=0,lease='' WHERE key=? AND lease=?").bind(JSON.stringify(state),Date.now(),key,lease).run();}
export async function startCollection(extra:string[]=[],trigger:State["trigger"]="manual",source="all",mode:CollectionMode="sfl") {
  if(mode==="free"&&!extra.length)throw new ApiError(400,"探したい仕事や物品名を入力してください。");
  const {lease,state}=await claim();
  try {
    if(state&&legacyTransportFailure(state)){
      await commit(lease,baseState([...new Set([...(state.knownTerms??[]),...extra])],trigger,source,mode));return;
    }
    if(state){
      state.preferredSource=source==="gsdf"||source==="msdf"||source==="asdf"?source:undefined;
      // Upgrade only already-started runs; new runs inspect the root first.
      for(const job of state.browsers)if(job.visited>0&&job.status!=="paused"){
        const upgraded=upgradeProcurementTraversal(job);
        const pdfUpgraded=upgradePdfPageLimit(job);
        const added=(job.sourceId==="gsdf"?addGsdfCatalog(job):job.sourceId==="msdf"?addMsdfCatalog(job):addAsdfCatalog(job))||upgraded||pdfUpgraded;
        if(added){job.status="running";if(state.status!=="paused")state.status="running";}
      }
    }
    if(state?.failedApi?.length&&["failed","partial","completed"].includes(state.status)){
      if(Date.now()<state.updatedAt+retryDelay)throw new ApiError(429,"取得に失敗した条件は5分空けて再試行できます。保存済みの結果は引き続き確認できます。");
      state.api.push(...state.failedApi);state.failedApi=[];state.apiIssues=[];state.status="running";
      state.message="取得に失敗した検索条件を再試行します。";
    }
    const added=state?extra.filter(term=>!(state.knownTerms??allDiscoveryTerms).includes(term)):[];
    if(state&&added.length){
      if(state.api.length+Math.ceil(added.length/4)>500)throw new ApiError(429,"調査中の条件が多いため、収集が進んでから追加してください。");
      for(let n=0;n<added.length;n+=4)state.api.push({terms:added.slice(n,n+4),depth:0});
      state.knownTerms=[...new Set([...(state.knownTerms??allDiscoveryTerms),...added])];
    }
    if(state&&trigger==="manual"&&extra.length){
      const requested=new Set(extra.map(norm));
      // Stable priority: keep every queued condition and its date range, but
      // inspect the requested work before unrelated shared-corpus backfill.
      state.api.sort((a,b)=>Number(b.terms.some(term=>requested.has(norm(term))))-Number(a.terms.some(term=>requested.has(norm(term)))));
    }
    if(state?.status==="running"){await commit(lease,state);return;}
    if(state?.status==="paused") {if(trigger==="manual"){state.status="running";state.browsers.forEach(b=>{if(!resumePastDeniedPage(b)&&b.status==="paused")b.status="running";});state.message="保存した続きから再開します。";}await commit(lease,state);return;}
    if(state && Date.now()-state.startedAt<6*3600000){if(added.length){state.status="running";state.message="追加したキーワードの公告を調べます。";await commit(lease,state);return;}await commit(lease,state);throw new ApiError(429,"直近の収集結果を利用できます。公式サイトへの再取得は6時間空けています。");}
    await commit(lease,baseState(extra,trigger,source,mode));
  } catch(error) {await db().prepare("UPDATE discovery_runtime SET locked_until=0,lease='' WHERE key=? AND lease=?").bind(rowKey,lease).run();throw error;}
}
export async function pauseCollection() {
  const {lease,state}=await claim();if(state){state.status="paused";state.message="収集を停止しました。保存済みの結果は引き続き確認できます。";await commit(lease,state);}
  else await db().prepare("UPDATE discovery_runtime SET locked_until=0,lease='' WHERE key=? AND lease=?").bind(rowKey,lease).run();
}
async function apiStep(state:State,remaining=Infinity,signal?:AbortSignal) {
  const task=state.api[0],url=new URL("https://www.kkj.go.jp/api/");
  // Real API responses can exceed 10MB at 200 rows. Start with a smaller
  // batch so useful candidates are saved before the date-range backfill.
  const count=Math.min(task.count??50,remaining);
  url.searchParams.set("Query",task.terms.join(" OR "));url.searchParams.set("Count",String(count));
  if(task.from&&task.to)url.searchParams.set("CFT_Issue_Date",`${task.from}/${task.to}`);
  try {
    const response=await fetchWithoutRedirects(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000),headers:{Accept:"application/xml","User-Agent":"SFL-Bid-Portal/3.0"}});
    if(!response.ok){await response.body?.cancel();throw new ApiError(response.status,`官公需 API：HTTP ${response.status}。この条件は未確認です。`);}
    const data=parseSearchResponse(new TextDecoder().decode(await boundedBytes(response,4*1024*1024)),task.terms,remaining);
    if(state.inspection)state.inspection.inspected+=data.inspectedCount;
    await saveStepItems(state,data.items.map(item=>({...item,searchSourceId:"kkj"})));
    if(data.items.length)state.resultRevision=(state.resultRevision??0)+1;
    state.api.shift();state.apiProcessed++;
    if(data.totalHits>data.returnedCount) {
      const parts=splitApiTask(task);
      // Search the remaining keyword groups before backfilling this large one.
      // Otherwise a broad term such as "研修" can starve the other two tabs.
      if(parts.length&&task.depth<22&&state.api.length+parts.length<=500)state.api.push(...parts);
      else {state.apiLimited=true;if(state.apiIssues.length<10)state.apiIssues.push(`「${task.terms.join("・")}」は取得上限。取得済みの候補を保存しています。`);}
    }
  }catch(error) {
    if(signal?.aborted)return; // Keep the unfinished request for explicit re-search.
    const message=error instanceof Error?error.message:"APIの取得に失敗しました。";
    if(/大きすぎ/.test(message)) {
      // Keep every keyword and date constraint; retry only the record count.
      // Do not turn a rejected response into an empty successful search.
      const smaller=[10,1].find(value=>value<count);
      if(smaller){task.count=smaller;state.apiProcessed++;return;}
      const parts=splitApiTask(task);if(parts.length&&task.depth<22&&state.api.length<490){state.api.shift();state.api.push(...parts);state.apiProcessed++;return;}
    }
    // Refusals are not bypassed with a browser, alternate host or proxy.
    if(error instanceof ApiError && [403,429].includes(error.status)){state.status="paused";state.message=message;return;}
    state.api.shift();state.apiProcessed++;(state.failedApi??=[]).push(task);
    if(state.apiIssues.length<10)state.apiIssues.push(message);
  }
}
async function saveStepItems(state:State,items:DiscoveryItem[]) {
  state.saved+=await saveDiscovered(items);
  if(state.inspection)state.inspection.ids=[...new Set([...state.inspection.ids,...await Promise.all(items.map(discoveryIdentity))])];
}
async function mainStep(state:State,remaining=Infinity,transport=officialTransport,signal?:AbortSignal) {
  const url="https://www.mod.go.jp/j/budget/chotatsu/naikyoku/mitsumori/index.html";
  try {
    let items=state.deferredMain;
    if(!items){const page=await transport.html(url);const parsed=parseOfficialHtml(page.html,page.url,"msdf");
    items=parsed.notices.map(n=>({id:n.url,title:n.title,agency:"防衛省",officialUrl:n.url,deadline:n.deadline?.date??"",deadlineEvidence:n.deadline?.evidence,source:"防衛省 内局",sourceUrl:url,matchedKeywords:[],summary:n.text.slice(0,500),descriptionText:n.text,searchSourceId:"mod",classification:classifyProcurement({title:n.title,description:n.text})}));}
    state.deferredMain=items.slice(remaining);
    items=items.slice(0,remaining);
    if(state.inspection)state.inspection.inspected+=items.length;
    await saveStepItems(state,items);
    if(items.length)state.resultRevision=(state.resultRevision??0)+1;
  }catch(error){if(signal?.aborted)return;state.mainIssues.push(error instanceof Error?error.message:"未確認です。");}
  state.mainPending=!!state.deferredMain?.length;state.mainProcessed++;
}
export async function stepCollection(key=rowKey,runId?:string) {
  const {lease,state}=await claim(key);
  if(!state){await db().prepare("UPDATE discovery_runtime SET locked_until=0,lease='' WHERE key=? AND lease=?").bind(key,lease).run();return;}
  try {
    if(state.inspection){
      if(state.inspection.id!==runId)throw new ApiError(409,"別の調査が開始されました。画面を再読み込みしてください。");
      if(stopInspection(state)){await commit(lease,state,key);return;}
    }
    if(state.status!=="running"||Date.now()<state.nextAt){await commit(lease,state,key);return;}
    state.browsers.forEach(b=>resumePastDeniedPage(b));
    // One leased request per run. Scheduled collection retains its shared key. Sources
    // rotate so a large API result cannot starve the unit/base pages.
    let options=[...(state.api.length?["api"]:[]),...(state.mainPending?["main"]:[]),...state.browsers.filter(b=>b.status==="running").map(b=>b.sourceId)];
    if(state.inspection?.source!==undefined&&state.inspection.source!=="all")options=options.filter(s=>state.inspection!.source==="kkj"?s==="api":state.inspection!.source==="mod"?s!=="api":s===state.inspection!.source);
    const remaining=state.inspection?state.inspection.limit-state.inspection.inspected:Infinity;
    const signal=state.inspection?AbortSignal.timeout(Math.max(1,state.inspection.endsAt-Date.now())):undefined;
    const transport=signal?createOfficialTransport(signal):officialTransport;
    const selected=state.preferredSource&&options.includes(state.preferredSource)?state.preferredSource:options[state.turn++%Math.max(options.length,1)];
    if(selected==="api")await apiStep(state,remaining,signal);
    else if(selected==="main")await mainStep(state,remaining,transport,signal);
    else if(selected) {
      const job=state.browsers.find(b=>b.sourceId===selected)!;
      const before=job.inspected;
      await advanceBrowserJob(job,transport,new Date(),remaining,signal);
      if(state.inspection)state.inspection.inspected+=job.inspected-before;
      await saveStepItems(state,job.items);
      if(job.items.length)state.resultRevision=(state.resultRevision??0)+1;
      job.items=[]; // durable rows, no top-100 truncation between pages
    }
    state.processed++;state.updatedAt=Date.now();state.nextAt=Date.now()+5000;
    if(state.inspection&&(!selected||stopInspection(state))){
      if(!state.inspection.reason){state.inspection.reason=hasIssues(state)?"error":"complete";state.status="completed";}
    }
    else if(!pending(state)){
      state.status=hasIssues(state)?(state.saved?"partial":"failed"):"completed";
      state.message=hasIssues(state)?endMessage(state):state.saved?"取得できた候補を保存しました。":"確認できた範囲に、保存対象の候補はありませんでした。";
    }
    else if(!state.api.length&&!state.mainPending&&!state.browsers.some(b=>b.status==="running")){state.status="paused";state.message="一部の取得先が停止しています。保存した結果と取得状況をご確認ください。";}
    else if(state.status==="running")state.message=`${state.processed}回の取得を処理しました。結果は順次保存されています。`;
    if(state.inspection&&state.status!=="running"&&!state.inspection.reason)state.inspection.reason=state.status==="completed"?"complete":"error";
    await commit(lease,state,key);
  }catch(error){await commit(lease,state,key);throw error;}
}

// A real scheduler may invoke this exported function. It is never represented
// as enabled until its heartbeat exists; ordinary page visits are not a cron.
export async function scheduledCollection() {
  await db().prepare("INSERT INTO discovery_runtime (key,data,lease,locked_until,updated_at) VALUES ('scheduler-heartbeat','{}','',0,?) ON CONFLICT(key) DO UPDATE SET updated_at=excluded.updated_at").bind(Date.now()).run();
  try{await startCollection([],"scheduled");}catch(e){if(!(e instanceof ApiError)||![409,429].includes(e.status))throw e;}
  for(let i=0;i<8;i++){try{await stepCollection();}catch(e){if(!(e instanceof ApiError)||e.status!==409)throw e;}await new Promise(r=>setTimeout(r,5500));}
}


function stopInspection(state:State) {
  const batch=state.inspection;if(!batch)return false;
  if(batch.reason)return true;
  if(batch.inspected>=batch.limit)batch.reason="limit";
  else if(Date.now()>=batch.endsAt)batch.reason="time";
  if(!batch.reason)return false;
  state.status="paused";state.message=batch.reason==="limit"?"公告100件の確認を終えました。":"60秒で調査を一区切りにしました。";
  return true;
}
export async function startInspection(key:string,signature:string,terms:string[],source:string,mode:CollectionMode) {
  const {lease,state:previous}=await claim(key);
  try{
    const state=previous?.inspection?.signature===signature?previous:baseState(terms,"manual",source,mode,true);
    // Continue the durable source queues, but always create a fresh 100-notice budget.
    if(state.inspection&&!state.inspection.reason&&Date.now()<state.inspection.endsAt&&state.status==="running"){
      await commit(lease,state,key);return state.inspection.id;
    }
    state.inspection={id:crypto.randomUUID(),signature,source,inspected:0,limit:100,endsAt:Date.now()+60000,ids:[]};
    state.status="running";state.nextAt=0;
    state.message="公告を最大100件確認します。";
    await commit(lease,state,key);return state.inspection.id;
  }catch(e){await db().prepare("UPDATE discovery_runtime SET locked_until=0,lease='' WHERE key=? AND lease=?").bind(key,lease).run();throw e;}
}
export async function inspectionIds(key:string,id:string) {
  const row=await db().prepare("SELECT data FROM discovery_runtime WHERE key=?").bind(key).first<{data:string}>();
  const state:State|null=row?JSON.parse(row.data):null;
  if(state?.inspection?.id!==id)throw new ApiError(409,"調査結果が更新されました。「最新情報を取得」から再開してください。");
  return state.inspection.ids;
}
export async function pauseInspection(key:string,id:string) {
  const {lease,state}=await claim(key);
  if(state?.inspection?.id===id){if(!stopInspection(state))state.inspection.reason="stopped";state.status="paused";await commit(lease,state,key);}
  else await db().prepare("UPDATE discovery_runtime SET locked_until=0,lease='' WHERE key=? AND lease=?").bind(key,lease).run();
}
