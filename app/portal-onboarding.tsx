"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft, Map, X } from "lucide-react";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { onboardingSteps, onboardingStorageKey, readOnboardingProgress } from "@/lib/portal-onboarding";
import type { GuideView } from "@/lib/portal-guide";
import { revealDetails } from "@/lib/portal-disclosures";
import { navigatorCharacters } from "./portal-navigator";

export function usePortalOnboarding(navigate:(view:GuideView)=>void) {
  const [step,setStep]=useState(0),[active,setActive]=useState(false),[completed,setCompleted]=useState(false);
  const persist=useCallback((index:number,done:boolean)=>{try{localStorage.setItem(onboardingStorageKey,JSON.stringify({seen:true,step:index,completed:done}));}catch{/* Device-local guidance remains usable without storage. */}},[]);
  useEffect(()=>{
    let saved=readOnboardingProgress(null);try{saved=readOnboardingProgress(localStorage.getItem(onboardingStorageKey));}catch{}
    setStep(saved.step);setCompleted(saved.completed);
    if(!saved.seen&&!window.location.hash)navigate("welcome");
    persist(saved.step,saved.completed);
  },[navigate,persist]);
  const start=(index=step)=>{const next=Math.max(0,Math.min(onboardingSteps.length-1,index));setStep(next);setActive(true);setCompleted(false);persist(next,false);navigate(onboardingSteps[next].view);};
  const pause=useCallback(()=>{setActive(false);persist(step,completed);},[persist,step,completed]);
  const next=()=>{if(step+1<onboardingSteps.length)start(step+1);else{setCompleted(true);setActive(false);persist(0,true);setStep(0);navigate("welcome");}};
  return {step,active,completed,start,pause,next,back:()=>start(step-1)};
}
export function PortalOnboarding({step,completed,onStart,onSearch}:{step:number;completed:boolean;onStart:(index:number)=>void;onSearch:()=>void}) {
  return <div className="onboarding-page">
    <section className="panel onboarding-intro"><div><span className="eyebrow">{completed?"基本の案内を確認しました":"初めてでも、この順番で進められます"}</span><h2>{completed?"次は、自分に合う案件を探しましょう。":"ナビゲーターと、最初の案件探しへ。"}</h2><p>使い方はどなたでも確認できます。案件検索に進むときは、発行された会員IDでログインしてください。</p><p className="onboarding-note">「次へ」で場所の確認だけ進めることもできます。収集や登録は、ご自身がその操作ボタンを押したときに実行されます。</p></div><div className="onboarding-start"><button className="button primary" onClick={()=>onStart(completed?0:step)}><Map size={20}/>{completed?"もう一度案内を見る":step>0?`ステップ${step+1}から再開`:"画面を見ながら始める"}</button>{step>0&&!completed&&<button className="text-button" onClick={()=>onStart(0)}>最初から案内を見る</button>}<button className="text-button" onClick={onSearch}>自分で案件を探す<ArrowRight size={18}/></button></div></section>
    <section className="panel onboarding-overview"><h2>使う順番と、確認すること</h2><p>見たい項目の「この場所を見る」から、その操作の案内を始められます。</p><div className="onboarding-table-scroll"><Table className="onboarding-table" role="table" aria-label="はじめての方の操作一覧"><TableHeader role="rowgroup"><TableRow role="row"><TableHead scope="col" role="columnheader">順番</TableHead><TableHead scope="col" role="columnheader">すること</TableHead><TableHead scope="col" role="columnheader">確認すること</TableHead><TableHead scope="col" role="columnheader">操作の案内</TableHead></TableRow></TableHeader><TableBody role="rowgroup">{onboardingSteps.map((item,index)=><TableRow role="row" key={item.title}><TableCell role="cell" data-label="順番"><span className="onboarding-number">{String(index+1).padStart(2,"0")}</span></TableCell><TableCell role="cell" data-label="すること"><strong>{item.title}</strong><p>{item.action}</p></TableCell><TableCell role="cell" data-label="確認すること">{item.check}</TableCell><TableCell role="cell" data-label="操作の案内"><button className="text-button" onClick={()=>onStart(index)} aria-label={`${item.title}の場所を見る`}>この場所を見る<ArrowRight size={17}/></button></TableCell></TableRow>)}</TableBody></Table></div></section>
    <section className="panel onboarding-help"><h2>途中で迷ったら</h2><p>左メニューの「はじめての方へ」から、いつでも案内を再開できます。スマートフォンでは、左上のメニューボタンから開いてください。</p><p>検索先の403・404や未確認の表示は「設定・仕様」の「公告の取得状況」で確認できます。取得できなかったページは、掲載元の公式リンクでご確認ください。</p></section>
  </div>;
}
export function PortalTour({step,view,onNext,onBack,onPause,onReturn}:{step:number;view:GuideView;onNext:()=>void;onBack:()=>void;onPause:()=>void;onReturn:()=>void}) {
  const item=onboardingSteps[step],panel=useRef<HTMLElement>(null);
  const [available,setAvailable]=useState(false),[character,setCharacter]=useState<string>("male");
  useEffect(()=>{const sync=()=>setCharacter(document.documentElement.dataset.navigatorTheme??"male");sync();const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:["data-navigator-theme"]});return()=>observer.disconnect();},[]);
  useEffect(()=>{
    let highlighted:HTMLElement|null=null,scrolled:HTMLElement|null=null;
    const find=()=>{
      const candidates=view===item.view?[...document.querySelectorAll<HTMLElement>(item.selector)]:[];
      for(const candidate of candidates) {
        if(!candidate.closest('[hidden], [inert], [aria-hidden="true"], [data-state="inactive"]'))revealDetails(candidate);
      }
      const actual=candidates.find(el=>el.getClientRects().length>0);
      const fallback="fallback" in item?[...document.querySelectorAll<HTMLElement>(item.fallback)].find(el=>el.getClientRects().length>0):null;
      const target=actual??(view===item.view?fallback:null)??null;setAvailable(!!actual);
      if(highlighted!==target){highlighted?.classList.remove("onboarding-highlight");highlighted=target;target?.classList.add("onboarding-highlight");}
      if(target&&scrolled!==target){scrolled=target;revealDetails(target);target.scrollIntoView({block:"start",behavior:"instant"});window.scrollBy({top:-24,behavior:"instant"});}
    };
    document.documentElement.classList.add("onboarding-active");
    find();const observer=new MutationObserver(find);observer.observe(document.getElementById("workspace-main")??document.body,{childList:true,subtree:true});
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();onPause();}};window.addEventListener("keydown",onKey);
    panel.current?.focus({preventScroll:true});
    return()=>{observer.disconnect();highlighted?.classList.remove("onboarding-highlight");document.documentElement.classList.remove("onboarding-active");window.removeEventListener("keydown",onKey);};
  },[item,view,onPause]);
  const avatar=navigatorCharacters.find(c=>c.id===character)??navigatorCharacters[1];
  return <aside className="onboarding-tour" ref={panel} tabIndex={-1} aria-label="初めての方への操作案内">
    <div className="onboarding-tour-top"><span>ナビゲーターと操作ガイド</span><button className="icon-button" onClick={onPause} aria-label="案内を中断する"><X size={20}/></button></div>
    <div className="onboarding-tour-copy" aria-live="polite" aria-atomic="true"><img src={avatar.image} width={1254} height={1254} alt=""/><div><span className="eyebrow">ステップ {step+1} / {onboardingSteps.length}</span><h2>{item.title}</h2></div><p>{view!==item.view?"別の画面を開いています。案内中の画面に戻ると続けられます。":!available&&"unavailable" in item?item.unavailable:item.action}</p></div>
    {view===item.view&&available&&<p className="onboarding-target-hint">黄色い枠で囲まれた場所をご確認ください。</p>}
    <p className="onboarding-tour-detail">{item.detail}</p>
    <div className="onboarding-tour-actions"><button className="button secondary" disabled={step===0} onClick={onBack}><ChevronLeft size={17}/>戻る</button>{view!==item.view?<button className="button primary" onClick={onReturn}>案内中の画面へ<ArrowRight size={17}/></button>:<button className="button primary" onClick={onNext}>{step===onboardingSteps.length-1?"案内を完了":"次へ"}{step===onboardingSteps.length-1?<Check size={17}/>:<ArrowRight size={17}/>}</button>}</div>
    <small>中断しても「はじめての方へ」から再開できます。</small>
  </aside>;
}
