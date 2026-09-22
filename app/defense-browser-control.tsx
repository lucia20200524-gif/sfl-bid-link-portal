"use client";

import { useEffect,useRef,useState } from "react";
import { LoaderCircle,Search,Play,Pause } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { CollectionMode } from "@/lib/collection-profiles";
import type { DefenseSourceId } from "@/lib/defense-browser-rules";
import type { ProcurementResult,SearchScope } from "@/lib/procurement-search";
import type { BrowserJobView } from "@/lib/defense-browser-types";
import DefenseBrowserPanel from "./defense-browser-panel";

async function request<T>(body?:unknown,query="",signal?:AbortSignal):Promise<T>{
  const response=await fetch(`/api/browser-search${query}`,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,cache:"no-store",signal:signal?AbortSignal.any([signal,AbortSignal.timeout(65000)]):AbortSignal.timeout(65000)});
  const result=await response.json() as T & {error?:string};if(!response.ok)throw new Error(result.error??"検索を進められませんでした。");return result;
}
export default function DefenseBrowserControl({mode,sourceId,keywords,scope,anyCollecting,onResult,onBusy}:{
  mode:CollectionMode;sourceId:DefenseSourceId;keywords:string;scope:SearchScope;anyCollecting:boolean;
  onResult:(result:ProcurementResult)=>void;onBusy:(busy:boolean)=>void;
}){
  const [configured,setConfigured]=useState<boolean|null>(null),[job,setJob]=useState<BrowserJobView|null>(null);
  const [active,setActive]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const callbacks=useRef({onResult,onBusy});callbacks.current={onResult,onBusy};
  const epoch=useRef(0);
  const accept=(next:BrowserJobView)=>{setJob(next);callbacks.current.onResult(next.result);if(next.progress.status!=="running")setActive(false);};
  useEffect(()=>{
    const controller=new AbortController();
    request<{configured:boolean;job:BrowserJobView|null}>(undefined,`?mode=${mode}&sourceId=${sourceId}`,controller.signal).then(data=>{
      if(controller.signal.aborted)return;
      setConfigured(data.configured);if(data.job){setJob(data.job);callbacks.current.onResult(data.job.result);}
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>{epoch.current++;controller.abort();callbacks.current.onBusy(false);};
  },[mode,sourceId]);
  useEffect(()=>{callbacks.current.onBusy(active||busy);},[active,busy]);
  useEffect(()=>{
    if(!active||!job||job.progress.status!=="running")return;
    const controller=new AbortController(),version=epoch.current;
    const timer=setTimeout(()=>{
      request<BrowserJobView>({action:"step",id:job.progress.id},"",controller.signal).then(next=>{
        if(version===epoch.current&&!controller.signal.aborted)accept(next);
      }).catch(e=>{if(!controller.signal.aborted){setError(e.message);setActive(false);}});
    },2000);
    return()=>{clearTimeout(timer);controller.abort();};
  },[active,job]);
  async function act(action:"start"|"resume"|"pause"){
    const version=++epoch.current;setError("");setBusy(true);setActive(false);
    try{
      const next=await request<BrowserJobView>(action==="start"?{action,mode,sourceId,keywords,scope}:{action,id:job?.progress.id});
      if(version!==epoch.current)return;
      accept(next);if(next.progress.status==="running")setActive(true);
    }catch(e){if(version===epoch.current)setError(e instanceof Error?e.message:"処理できませんでした。");}finally{if(version===epoch.current)setBusy(false);}
  }
  const progress=job?.progress;
  const checked=progress?.targets.filter(t=>t.state==="checked").length??0;
  const resumable=!!progress&&["running","paused"].includes(progress.status);
  return <div className="browser-search-control">
    <DefenseBrowserPanel sourceId={sourceId} configured={configured}/>
    <div className="browser-search-actions">
      <button type="button" className="button primary" disabled={!configured||anyCollecting||busy||!keywords.trim()} onClick={()=>void act("start")}><Search size={19}/>{configured?"公式ページから案件を検索":"接続設定後に検索できます"}</button>
      {resumable&&!active&&<button type="button" className="button secondary" disabled={!configured||anyCollecting||busy} onClick={()=>void act("resume")}><Play size={18}/>保存した検索を再開</button>}
      {active&&<button type="button" className="button secondary" disabled={busy} onClick={()=>void act("pause")}><Pause size={18}/>一時停止</button>}
    </div>
    <p className="form-hint">この画面を開いている間、1ページずつ確認します。画面を閉じても進捗は保存され、再開できます。確認には数分以上かかる場合があります。</p>
    {error&&<p className="app-error" role="alert">{error}</p>}
    {progress&&<div className="browser-progress" aria-label="公式ページの取得状況">
      <div className="browser-progress-title"><strong>{active?<><LoaderCircle className="spin" size={18}/>公式ページを確認中</>:progress.status==="completed"?"確認終了":progress.status==="cancelled"?"停止済み":"進捗を保存しています"}</strong><span>{progress.visited}ページ確認 / 上限{progress.limit}ページ</span></div>
      <Progress value={Math.min(100,Math.round(progress.visited/progress.limit*100))} aria-label="ページ確認上限に対する進捗"/>
      <p role="status">{progress.message}</p>
      <p>指定先：掲載欄確認済み {checked} / {progress.targets.length} · 待機中のページ {progress.queued}{progress.limited&&" · 取得上限あり"}</p>
      <details><summary>確認先ごとの状況を表示</summary><ul className="browser-target-progress">{progress.targets.map(t=><li key={t.name} data-state={t.state}><strong>{t.name}</strong><span>{({pending:"未確認・確認中",checked:"掲載欄確認済み",partial:"一部取得",failed:"取得できず"})[t.state]} · {t.visited}ページ</span>{t.notes.map((note,i)=><small key={i}>{note}</small>)}{t.limited&&<small>上限に達したため未確認ページがあります。</small>}</li>)}</ul></details>
    </div>}
  </div>;
}
