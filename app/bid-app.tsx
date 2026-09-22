"use client";
import BidInsights from "./bid-insights";
import BidPracticeTools from "./bid-practice-tools";
import { createPracticeDraft, practiceViews, type PracticeView } from "@/lib/bid-practice";
import { candidateToBid } from "@/lib/procurement-workbench";
import { DiscoveryWorkspace } from "./discovery-workspace";
import DiscoveryStatus from "./discovery-status";
import PortalSpecs from "./portal-specs";
import EngineerSpec from "./engineer-spec";
import PortalSupport from "./portal-support";
import PortalUsefulInfo from "./portal-useful-info";
import PortalBidFlow from "./portal-bid-flow";
import { PortalDisplayProvider, PortalSidebarResizer, PortalSidebarToggle, PortalTextSizeControls } from "./portal-display-settings";
import { PortalOnboarding, PortalTour, usePortalOnboarding } from "./portal-onboarding";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LayoutDashboard, BriefcaseBusiness, Search, Tags, Mail, Settings2, Plus, ArrowUpRight, Copy, Check, RefreshCw, CalendarDays, LogIn, LogOut, ShieldCheck, LoaderCircle, ChevronRight, Users, X, ClipboardCheck, CodeXml, GraduationCap, BookOpen, Headphones, Lightbulb, ListOrdered, Calculator, FileSearch } from "lucide-react";
import { Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Empty as EmptyRoot, EmptyHeader, EmptyTitle, EmptyMedia, EmptyContent } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import OpenCounterFeature from "./open-counter-feature";
import MemberAccess from "./member-access";
import { MemberLogin, MemberLogout, MembershipSettings } from "./portal-membership";
import PortalNavigator from "./portal-navigator";
import { onboardingSteps } from "@/lib/portal-onboarding";
import type { GuideTarget } from "@/lib/portal-guide";
import { revealDetails } from "@/lib/portal-disclosures";
import { isFutureBidDeadline } from "@/lib/procurement-deadline";
import BidEditorForm from "./bid-editor-form";
import { type CollectionResult } from "./collection-table";
import type { DiscoveryFeed, DiscoveryItem } from "@/lib/discovery-domain";
import { type CollectionSearchFields } from "./collection-search-form";
import { MemberLarkSettingsPanel } from "./member-lark-settings";
import { LarkConnectionPanel } from "./lark-registration";
import { searchLinks, keywordGroups, searchExamples, signatureProfiles } from "@/lib/portal-content";
import { searchModes, defaultLarkMode, engineerReferences, type CollectionMode } from "@/lib/collection-profiles";
import { procurementSource, type ProcurementSourceId } from "@/lib/procurement-sources";
import type { ResultCategory } from "@/lib/procurement-classification";
import { emptyBid, statusLabels, statuses, activeStatuses, todayJst, displayDate, deadlineText, type Bid, type BidInput, type BidStatus, type Session, type Member } from "@/lib/bid-domain";

const navItems=[
 {id:"participation-check",label:"参加条件チェック",icon:ShieldCheck,group:"practice"},
 {id:"cost-simulator",label:"見積・採算シミュレーター",icon:Calculator,group:"practice"},
 {id:"document-review",label:"公告・仕様書の確認サポート",icon:FileSearch,group:"practice"},
 {id:"welcome",label:"はじめての方へ",icon:BookOpen,group:"guide"},
 {id:"useful-info",label:"お役立ち情報",icon:Lightbulb,group:"guide"},
 {id:"flow",label:"入札の手順と流れ",icon:ListOrdered,group:"guide"},
 {id:"dashboard",label:"オープンカウンター特集",icon:LayoutDashboard,group:"search"},
 {id:"collected",label:"案件を探す",icon:Search,group:"search"},
 {id:"bids",label:"案件・提出管理",icon:BriefcaseBusiness,group:"hidden"},
 {id:"insights",label:"期限・結果分析",icon:CalendarDays,group:"hidden"},
 {id:"support",label:"受講後サポート",icon:Headphones,group:"support"},
 {id:"links",label:"公告リンク・確認リスト",icon:ClipboardCheck,group:"search"},
 {id:"keywords",label:"検索キーワード集",icon:Tags,group:"search"},
 {id:"signatures",label:"連絡用の署名",icon:Mail,group:"support"},
 {id:"collection-status",label:"公告の取得状況",icon:RefreshCw,group:"settings"},
 {id:"engineer",label:"エンジニア",icon:CodeXml,group:"settings"},
 {id:"specs",label:"使い方・仕様",icon:BookOpen,group:"settings"},
 {id:"settings",label:"設定・メンバー",icon:Settings2,group:"settings"},
] as const;
const navGroups = [
 {id:"search",label:"案件検索・確認"},
 {id:"practice",label:"入札の実務ツール"},
 {id:"guide",label:"使い方・ガイド"},
 {id:"support",label:"サポート・連絡"},
 {id:"settings",label:"設定・仕様"},
] as const;
const modePresentation = { sfl: { icon: BriefcaseBusiness, hint: "AI・DX / 研修・制作" }, engineer: { icon: CodeXml, hint: "Web制作 / システム開発" }, academy: { icon: GraduationCap, hint: "物品 / 印刷・清掃・運営" }, free: { icon: Search, hint: "自由なキーワードで調査" } };
type View=typeof navItems[number]["id"];
type CollectionState=CollectionSearchFields & {category:ResultCategory;result:CollectionResult;loading:boolean;error:string};
class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
async function api<T>(path:string,method="GET",body?:unknown,signal?:AbortSignal):Promise<T>{const r=await fetch(path,{method,headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,signal,cache:"no-store"});const data=await r.json() as T & {error?:string;code?:string};if(!r.ok){if(typeof window!=="undefined"&&(r.status===401||data.code==="membership"))window.dispatchEvent(new CustomEvent("portal-access-denied",{detail:{status:r.status,message:data.error,code:data.code}}));throw new HttpError(r.status,data.error||"処理できませんでした。");}return data as T;}
function ErrorBox({message}:{message:string}){return message?<div className="app-error" role="alert">{message}</div>:null;}
function Empty({title,children}:{title:string;children?:ReactNode}){return <EmptyRoot className="empty-state"><EmptyHeader><EmptyMedia><BriefcaseBusiness size={32}/></EmptyMedia><EmptyTitle>{title}</EmptyTitle></EmptyHeader><EmptyContent>{children}</EmptyContent></EmptyRoot>;}
function Field({label,children,wide=false,hint}:{label:string;children:ReactNode;wide?:boolean;hint?:string}){return <label className={`form-field${wide?" full":""}`}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
function Status({value}:{value:BidStatus}){return <span className={`status status-${value}`}>{statusLabels[value]}</span>;}
function AppNav({view,onChange}:{view:View;onChange:(v:View)=>void}){
 const {setOpenMobile}=useSidebar();
 const items=(group:string)=><SidebarMenu>{navItems.filter(item=>item.group===group).map(item=><SidebarMenuItem key={item.id}><SidebarMenuButton size="lg" className={item.id==="useful-info"?"nav-useful-info":item.id==="engineer"?"nav-engineer":undefined} isActive={view===item.id} onClick={()=>{onChange(item.id);setOpenMobile(false);}} aria-current={view===item.id?"page":undefined}><item.icon/><span>{item.label}</span>{view===item.id&&<ChevronRight className="nav-arrow"/>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>;
 const activeGroup=navItems.find(item=>item.id===view)?.group??"search";
 const [openGroups,setOpenGroups]=useState<string[]>(()=>[activeGroup]);
 useEffect(()=>{setOpenGroups(groups=>groups.includes(activeGroup)?groups:[...groups,activeGroup]);},[view,activeGroup]);
 return <nav className="sidebar-grouped-nav" aria-label="業務メニュー">{navGroups.map(group=><Collapsible key={group.id} className="sidebar-nav-group" data-nav-group={group.id} open={openGroups.includes(group.id)} onOpenChange={open=>setOpenGroups(groups=>open?[...new Set([...groups,group.id])]:groups.filter(id=>id!==group.id))}>
   <h2 className="sidebar-nav-heading"><CollapsibleTrigger className="sidebar-nav-toggle"><span>{group.label}</span><ChevronRight size={19} aria-hidden="true"/></CollapsibleTrigger></h2>
   <CollapsibleContent className="sidebar-nav-items">{items(group.id)}</CollapsibleContent>
 </Collapsible>)}</nav>;
}

export default function BidApp({signInUrl,signOutUrl,initialSession}:{signInUrl:string;signOutUrl:string;initialSession?:Session}){
 const [view,setView]=useState<View>("dashboard");
 const [practiceDraft,setPracticeDraft]=useState(createPracticeDraft);
 const isPracticeView=practiceViews.includes(view as PracticeView);
 // Keep the running search mounted while its status page is open.
 const [searchMounted,setSearchMounted]=useState(false);
 useEffect(()=>{
   if(view==="collected")setSearchMounted(true);
   else if(view!=="collection-status")setSearchMounted(false);
 },[view]);
 const [articleId,setArticleId]=useState("");
 const [columnPage,setColumnPage]=useState(1);
 const [session,setSession]=useState<Session|null>(initialSession??null),[authLoading,setAuthLoading]=useState(!initialSession),[authError,setAuthError]=useState("");
 const searchAllowed=!!session?.membership?.allowed;
 const requiresMember=[...practiceViews,"dashboard","collected","links","keywords","bids","insights","collection-status"].includes(view);
 const [accessStatus,setAccessStatus]=useState<"signin"|"membership"|"error">("signin");
 const [revision,setRevision]=useState(0),[dataError,setDataError]=useState("");
 const [list,setList]=useState<{items:Bid[];total:number}>({items:[],total:0}),[listLoading,setListLoading]=useState(false);
 const [query,setQuery]=useState(""),[statusFilter,setStatusFilter]=useState("active"),[deadlineFilter,setDeadlineFilter]=useState(""),[assigneeFilter,setAssigneeFilter]=useState(""),[offset,setOffset]=useState(0);
 const [editor,setEditor]=useState<Bid|"new"|null>(null),[draft,setDraft]=useState<BidInput>({...emptyBid}),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState("");
 const [copied,setCopied]=useState("");
 const setNotice=(message:string)=>toast(message);
 const [keywordQuery,setKeywordQuery]=useState("");
 const normalizedKeywordQuery=keywordQuery.trim().toLowerCase();
 const visibleKeywordGroups=keywordGroups.filter(group=>!normalizedKeywordQuery||[group.title,...group.keywords].some(word=>word.toLowerCase().includes(normalizedKeywordQuery)));
 const [assistantVisited,setAssistantVisited]=useState<string[]>([]),[assistantOpened,setAssistantOpened]=useState<string|null>(null);
 const [collectionMode,setCollectionMode]=useState<CollectionMode>("sfl");
 const [collectionStates,setCollectionStates]=useState<Record<CollectionMode,CollectionState>>(()=>Object.fromEntries<CollectionState>(searchModes.map(mode=>[mode.id,{keyword:mode.defaultKeyword,keywordGroup:"recommended",sourceId:"kkj",scope:"fulltext",category:"all",result:{items:[],sources:[]},loading:false,error:""}])) as Record<CollectionMode,CollectionState>);
 const updateCollection=(mode:CollectionMode,patch:Partial<CollectionState>)=>setCollectionStates(states=>({...states,[mode]:{...states[mode],...patch}}));

 const assistantKeyword=collectionStates[collectionMode].keyword;
 const setAssistantKeyword=(keyword:string)=>updateCollection(collectionMode,{keyword});
 const [memberEmail,setMemberEmail]=useState(""),[memberName,setMemberName]=useState(""),[memberBusy,setMemberBusy]=useState(false),[memberError,setMemberError]=useState(""),[removing,setRemoving]=useState<Member|null>(null);
 const refresh=()=>setRevision(v=>v+1);
 const navigate=useCallback((next:View)=>{setView(next);setArticleId("");setColumnPage(1);window.history.replaceState(null,"",`#${next}`);window.scrollTo({top:0});},[]);
 const onboarding=usePortalOnboarding(navigate);
 useEffect(()=>{
   const aliases:Record<string,View>={search:"links",assistant:"links","ai-research":"dashboard",signature:"signatures"};
   const syncHash=()=>{
     const [route,query=""]=window.location.hash.slice(1).split("?");
     const [hash,article=""]=route.split("/");
     const page=Number(new URLSearchParams(query).get("page")??1);
     if(navItems.some(x=>x.id===hash))setView(hash as View);else setView(aliases[hash]??"dashboard");
     if(hash==="assistant")window.history.replaceState(null,"","#links");
     setArticleId(hash==="useful-info"?article:"");
     setColumnPage(hash==="useful-info"&&Number.isSafeInteger(page)&&page>0?page:1);
   };
   syncHash();window.addEventListener("hashchange",syncHash);window.addEventListener("popstate",syncHash);
   return()=>{window.removeEventListener("hashchange",syncHash);window.removeEventListener("popstate",syncHash);};
 },[]);
 useEffect(()=>{
   const controller=new AbortController();let checking=false;
   const lock=(status:number,message:string)=>{setSession(null);setList({items:[],total:0});setEditor(null);setRemoving(null);setAccessStatus(status===401?"signin":status===403?"membership":"error");setAuthError(status===401?"":message);setAuthLoading(false);};
   const denied=(event:Event)=>{const detail=(event as CustomEvent<{status:number;message:string;code?:string}>).detail;if(detail?.code==="member_login_required"){setSession(current=>current?{...current,membership:{allowed:false,kind:null},members:[]}:null);setEditor(null);setList({items:[],total:0});setSearchMounted(false);}else if(detail)lock(detail.status,detail.message);};
   const verify=async()=>{if(checking||document.visibilityState==="hidden")return;checking=true;try{const next=await api<Session>("/api/workspace","GET",undefined,controller.signal);if(!controller.signal.aborted){setSession(next);setAuthError("");}}catch(error){if(!controller.signal.aborted){const e=error as HttpError;lock(e.status,e.message);}}finally{checking=false;if(!controller.signal.aborted)setAuthLoading(false);}};
   const restored=(event:PageTransitionEvent)=>{if(event.persisted)window.location.reload();};
   window.addEventListener("portal-access-denied",denied);window.addEventListener("focus",verify);window.addEventListener("pageshow",restored);document.addEventListener("visibilitychange",verify);
   void verify();const interval=window.setInterval(verify,60000);
   return()=>{controller.abort();window.clearInterval(interval);window.removeEventListener("portal-access-denied",denied);window.removeEventListener("focus",verify);window.removeEventListener("pageshow",restored);document.removeEventListener("visibilitychange",verify);};
 },[]);
 useEffect(()=>{if(!session?.membership?.allowed||view!=="bids")return;const c=new AbortController();setListLoading(true);const timer=setTimeout(()=>{const p=new URLSearchParams({q:query,status:statusFilter,assignee:assigneeFilter,deadline:deadlineFilter,offset:String(offset)});api<{items:Bid[];total:number}>(`/api/bids?${p}`,"GET",undefined,c.signal).then(v=>{setList(v);setDataError("");}).catch(e=>{if(e.name!=="AbortError")setDataError(e.message);}).finally(()=>{if(!c.signal.aborted)setListLoading(false);});},250);return()=>{clearTimeout(timer);c.abort();};},[session,view,query,statusFilter,assigneeFilter,deadlineFilter,offset,revision]);
 const copy=async(text:string,key:string)=>{try{try{await navigator.clipboard.writeText(text);}catch{const el=document.createElement("textarea");el.value=text;el.style.position="fixed";el.style.opacity="0";document.body.appendChild(el);el.select();const ok=document.execCommand("copy");el.remove();if(!ok)throw Error("コピーできませんでした。");}setCopied(key);setNotice("コピーしました");window.setTimeout(()=>setCopied(v=>v===key?"":v),1800);}catch{setNotice("コピーできませんでした。ブラウザの設定をご確認ください。");}};
 const copyButton=(text:string,key:string,label="コピー",className="button secondary")=><button type="button" className={className} onClick={()=>copy(text,key)}>{copied===key?<Check size={17}/>:<Copy size={17}/>}<span>{copied===key?"コピー済み":label}</span></button>;
 const openEditor=(bid?:Bid,defaults:Partial<BidInput>={})=>{if(!searchAllowed){navigate("collected");return;}setEditor(bid??"new");setDraft(bid?{...bid}:{...emptyBid,...defaults,assignee:defaults.assignee??session?.user.email??""});setSaveError("");};
 const manageCandidate=(item:DiscoveryItem,mode:CollectionMode)=>openEditor(undefined,candidateToBid(item,mode));
 const openById=async(id:string)=>{try{const value=await api<{bid:Bid}>(`/api/bids/${id}`);openEditor(value.bid);}catch(e){setNotice(e instanceof Error?e.message:"案件を開けませんでした。");}};
 const updateDraft=<K extends keyof BidInput>(key:K,value:BidInput[K])=>setDraft(d=>({...d,[key]:value}));
 const save=async(event:FormEvent)=>{event.preventDefault();if(saving)return;setSaving(true);setSaveError("");try{const editing=editor&&editor!=="new";await api(editing?`/api/bids/${editor.id}`:"/api/bids",editing?"PATCH":"POST",{...draft,...(editing?{revision:editor.revision}:{})});setEditor(null);setNotice(editing?"案件を更新しました":"案件を登録しました");refresh();}catch(e){setSaveError(e instanceof Error?e.message:"保存できませんでした。");}finally{setSaving(false);}};
 const addMember=async(event:FormEvent)=>{event.preventDefault();setMemberBusy(true);setMemberError("");try{const r=await api<{members:Member[]}>("/api/members","POST",{email:memberEmail,name:memberName});setSession(v=>v?{...v,members:r.members}:null);setMemberEmail("");setMemberName("");setNotice("利用メンバーを登録しました");}catch(e){setMemberError(e instanceof Error?e.message:"登録できませんでした。");}finally{setMemberBusy(false);}};
 const removeMember=async()=>{if(!removing)return;setMemberBusy(true);try{const r=await api<{members:Member[]}>("/api/members","DELETE",{email:removing.email});setSession(v=>v?{...v,members:r.members}:null);setRemoving(null);setNotice("メンバー一覧から削除しました");}catch(e){setMemberError(e instanceof Error?e.message:"解除できませんでした。");}finally{setMemberBusy(false);}};
 const memberLabel=(email:string)=>session?.members.find(m=>m.email===email)?.name||email||"未割当";

 const discoveryStatus=useCallback((mode:CollectionMode,feed:DiscoveryFeed,source:ProcurementSourceId|"all",collecting:boolean)=>setCollectionStates(states=>({...states,[mode]:{...states[mode],sourceId:source==="all"?"kkj":source,loading:collecting,error:feed.progress.status==="failed"?feed.progress.message:"",result:{items:feed.items,sources:feed.progress.sources.map(source=>({title:source.name,status:source.issues.length?"partial" as const:"ok" as const,count:0})),collectedAt:feed.progress.updatedAt?new Date(feed.progress.updatedAt).toISOString():undefined}}})),[]);
 const openBidList=(status="active",deadline="")=>{setStatusFilter(status);setDeadlineFilter(deadline);setQuery("");setAssigneeFilter("");setOffset(0);setList({items:[],total:0});setListLoading(true);navigate("bids");refresh();};
 const navigatorCollection=collectionStates[collectionMode];
 const navigatorSearchDay=navigatorCollection.result.search?.searchedOn??(navigatorCollection.result.collectedAt?todayJst(new Date(navigatorCollection.result.collectedAt)):todayJst());
 const followGuide=(target:GuideTarget)=>{
   if("view" in target) navigate(target.view);
   window.requestAnimationFrame(()=>{
     const element=document.getElementById("anchor" in target?`collection-${target.anchor}-${collectionMode}`:"workspace-main");
     revealDetails(element);
     element?.scrollIntoView({block:"start",behavior:"auto"});
     element?.focus({preventScroll:true});
   });
 };

 const bidderTable=(items:Bid[])=><Table className="bid-table"><TableHeader><TableRow><TableHead>案件・発注機関</TableHead><TableHead>提出期限</TableHead><TableHead>状況</TableHead><TableHead>担当者</TableHead><TableHead>適合度（担当者判断）</TableHead><TableHead><span className="sr-only">操作</span></TableHead></TableRow></TableHeader><TableBody>{items.map(b=><TableRow key={b.id}><TableCell><button className="bid-title" onClick={()=>openEditor(b)}>{b.title}</button><p className="cell-secondary">{b.agency}{b.region?` / ${b.region}`:""}</p></TableCell><TableCell><strong className={activeStatuses.includes(b.status)&&b.deadline&&b.deadline<=todayJst()?"text-danger":""}>{displayDate(b.deadline)}</strong>{activeStatuses.includes(b.status)&&<small className="cell-secondary">{deadlineText(b.deadline)}</small>}</TableCell><TableCell><Status value={b.status}/></TableCell><TableCell>{memberLabel(b.assignee)}</TableCell><TableCell><span className={`fit fit-${b.fit}`}>{({A:"A 適合度高",B:"B 要件確認",C:"C 慎重判断"})[b.fit]}</span></TableCell><TableCell><button className="text-button" onClick={()=>openEditor(b)} aria-label={`${b.title}の詳細を開く`}>詳細・編集<ChevronRight size={17}/></button></TableCell></TableRow>)}</TableBody></Table>;

 if(!session)return <MemberAccess signInUrl={signInUrl} signOutUrl={signOutUrl} status={authLoading?"loading":accessStatus} message={authError}/>;
 if(requiresMember&&!searchAllowed)return <PortalDisplayProvider><main className="workspace-content membership-login-screen" id="workspace-main" data-view="login" tabIndex={-1}><MemberLogin signInUrl={signInUrl} onGuide={()=>navigate("welcome")}/></main></PortalDisplayProvider>;
 return <PortalDisplayProvider><Sidebar className="app-sidebar"><SidebarHeader><a className="app-brand" href="#dashboard" onClick={e=>{e.preventDefault();navigate("dashboard");}}><span className="brand-images"><img src="/sfl-logo.jpeg" alt="SFL"/><img src="/lucia-logo.jpeg" alt="LUCIA"/></span><span className="brand-kicker">BID WORKSPACE</span><strong className="app-brand-title"><span>入札リンク</span><wbr/><span>ポータル</span></strong><small>LUCIA × 合同会社SFL</small></a></SidebarHeader><SidebarContent><AppNav view={view} onChange={next=>{onboarding.pause();navigate(next);}}/></SidebarContent><SidebarFooter><div className="sidebar-user"><span className="avatar" aria-hidden="true">S</span><div><strong>合同会社SFL/LUCIA</strong><small>{session?session.role==="owner"?"管理者":session.membership?.allowed?session.user.name:"未ログイン":"利用状況を確認中"}</small></div>{session&&session.membership?.kind!=="member"&&session.role!=="guest"&&<a href={signOutUrl} target="_top" aria-label="ログアウト"><LogOut size={17}/></a>}</div></SidebarFooter><PortalSidebarResizer/></Sidebar>
 <SidebarInset className="app-main"><header className="app-topbar"><div className="topbar-title"><PortalSidebarToggle/><strong>{navItems.find(n=>n.id===view)?.label}</strong></div><div className="topbar-actions">{session.membership?.kind==="member"&&<MemberLogout/>}<span className="today-label"><CalendarDays size={17}/>{displayDate(todayJst())}</span><PortalTextSizeControls/></div></header>
 <main className="workspace-content" id="workspace-main" data-view={view} tabIndex={-1}><div className="page-heading"><div><h1>{navItems.find(n=>n.id===view)?.label}</h1><p>{({"participation-check":"参加条件と自社の状況を、原文に沿って照合します。","cost-simulator":"金額・費用・作業時間から、受注後の採算を試算します。","document-review":"仕事内容・期限・必要書類を、根拠のページと一緒に整理します。","collection-status":"公告の取得件数、処理待ち、取得先ごとの確認状況をまとめています。",engineer:"面談・引き継ぎ用の技術仕様書。構成、取得処理、検索、Lark連携を確認できます。",flow:"案件探しから契約・納品・入金まで、順番に確認しましょう。",insights:"手続きの期限と対応結果を確認し、次の案件選定につなげます。","useful-info":"合同会社SFLが届ける、官公庁の仕事とAI・DXの実践コラム。",support:"受講後のチャット相談と、入札参加・結果確認のサポートをご案内します。",welcome:"ナビゲーターと一緒に、最初の案件探しから始めましょう。",dashboard:"見積合わせの案件を探して、条件確認からLark登録へ。",bids:"参加判断から提出・結果まで、担当者と進捗を管理。",collected:"あなたの得意な仕事から。検索して、公告を確かめ、Larkへ登録。",links:"公式サイトで公告を調べ、確認済みのサイトをチェック。",keywords:"探したい仕事に合う検索語を選択。",signatures:"担当者と参加名義に合わせて署名をコピー。",settings:"Larkの接続先と、会員ログインを管理します。",specs:"検索からLark登録まで。使い方と現在の仕様をまとめています。"})[view]}</p></div>{searchAllowed&&view==="bids"&&<div className="actions"><button className="button secondary" onClick={refresh} aria-label="データを更新"><RefreshCw size={17}/>更新</button><button className="button primary" onClick={()=>openEditor()}><Plus size={18}/>手入力で登録</button></div>}</div>

 {(!requiresMember||searchAllowed)&&view!=="engineer"&&!isPracticeView&&!(view==="useful-info"&&articleId)&&<PortalNavigator context={{view,mode:collectionMode,sourceId:navigatorCollection.sourceId,authenticated:searchAllowed,authLoading,owner:session?.role==="owner",loading:navigatorCollection.loading,failed:!!navigatorCollection.error||(navigatorCollection.result.sources.length>0&&navigatorCollection.result.sources.every(source=>source.status==="failed")),partial:navigatorCollection.result.sources.some(source=>source.status==="partial"),attempted:!!navigatorCollection.result.collectedAt||navigatorCollection.result.sources.length>0,hasResults:navigatorCollection.result.items.some(item=>isFutureBidDeadline(item.deadline,navigatorSearchDay))}} onNavigate={followGuide}/>}
 <>
 {view==="useful-info"&&<PortalUsefulInfo articleId={articleId} page={columnPage}/>}
 {view==="flow"&&<PortalBidFlow/>}
 {view==="support"&&<PortalSupport/>}
 {view==="welcome"&&<PortalOnboarding step={onboarding.step} completed={onboarding.completed} onStart={onboarding.start} onSearch={()=>navigate("collected")}/>}
 {view==="engineer"&&<EngineerSpec/>}
 {view==="collection-status"&&<DiscoveryStatus onSearch={()=>navigate("collected")}/>}
 {view==="specs"&&<PortalSpecs onSearch={()=>navigate("collected")}/>}
 {view==="settings"&&searchAllowed&&<><MemberLarkSettingsPanel/>{session?.role==="owner"&&<LarkConnectionPanel/>}</>}
 {view==="insights"&&<BidInsights onOpen={id=>void openById(id)} revision={revision}/>}
 {view==="dashboard"&&<OpenCounterFeature mode={defaultLarkMode(collectionMode)} onMode={setCollectionMode} onSearch={()=>navigate("collected")}/>}
 {view==="bids"&&<>
 <section data-tour="bid-management" className="panel bid-filters" aria-label="案件の絞り込み"><div className="filter-bar">
 <label className="search-input"><span className="sr-only">案件名・発注機関・地域で検索</span><Search size={18}/><Input placeholder="案件名・発注機関・地域で検索" value={query} onChange={e=>{setQuery(e.target.value);setOffset(0);}}/></label>
 <Field label="進捗"><NativeSelect value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setOffset(0);}}><option value="active">対応中のみ</option><option value="">すべての進捗</option>{statuses.map(status=><option key={status} value={status}>{statusLabels[status]}</option>)}</NativeSelect></Field>
 <Field label="締切"><NativeSelect value={deadlineFilter} onChange={e=>{setDeadlineFilter(e.target.value);setOffset(0);}}><option value="">すべての締切</option><option value="soon">7日以内</option><option value="overdue">締切超過</option><option value="unknown">締切未入力</option></NativeSelect></Field>
 <Field label="担当者"><NativeSelect value={assigneeFilter} onChange={e=>{setAssigneeFilter(e.target.value);setOffset(0);}}><option value="">全員</option>{session?.members.map(member=><option value={member.email} key={member.email}>{member.name}</option>)}</NativeSelect></Field>
 <button className="text-button" onClick={()=>openBidList("")}>条件を解除</button></div></section>
 <ErrorBox message={dataError}/><section className="panel table-panel" aria-busy={listLoading}><div className="table-summary"><strong role="status">{listLoading?"読み込み中…":`${list.total}件の案件`}</strong><span>締切が近い順 · 案件名を押して詳細・進捗を編集</span></div>
 {listLoading?<Empty title="案件を読み込んでいます…"/>:list.items.length?bidderTable(list.items):<Empty title={dataError?"一覧を読み込めませんでした":"該当する案件はありません"}><p>{dataError?"更新ボタンで再度お試しください。":"条件を変更するか、新しい候補を探してください。"}</p><div className="actions"><button className="button secondary" onClick={()=>openBidList("")}>すべての案件を見る</button><button className="button primary" onClick={()=>navigate("collected")}>案件を探す</button></div></Empty>}
 <Pagination className="pagination" aria-label="案件一覧のページ"><span>{listLoading?"—":list.total?`${offset+1}–${Math.min(offset+50,list.total)} / ${list.total}件`:"0件"}</span><div className="actions"><button className="button secondary" disabled={offset===0||listLoading} onClick={()=>setOffset(v=>Math.max(0,v-50))}>前へ</button><button className="button secondary" disabled={offset+50>=list.total||listLoading} onClick={()=>setOffset(v=>v+50)}>次へ</button></div></Pagination></section>
 </>}
 {isPracticeView&&<BidPracticeTools key={view} view={view as PracticeView} draft={practiceDraft} setDraft={setPracticeDraft}/>}
 {view==="links"&&<><section className="panel assistant-hero"><div><h2>検索先を順番に確認</h2><p>登録済みのサイトで公告を確認し、終わったら「確認済みにする」を押してください。</p></div><div className="assistant-progress"><strong>{assistantVisited.length}</strong><span> / {searchLinks.length}サイト確認済み</span><Progress value={assistantVisited.length/searchLinks.length*100} aria-label={`${assistantVisited.length}サイト確認済み`}/></div></section><section className="panel assistant-toolbar"><Field label="調査キーワード" hint="各サイトで検索するときに使う語句です。"><Input value={assistantKeyword} onChange={e=>setAssistantKeyword(e.target.value)} placeholder="例：Webサイト再構築 業務委託"/></Field><div className="actions">{copyButton(assistantKeyword,"assistant-keyword","キーワードをコピー")}<button className="button secondary" type="button" onClick={()=>{setAssistantVisited([]);setAssistantOpened(null);}}>最初から</button></div><p className="form-hint">サイトを開くと新しいタブで表示されます。確認後、「確認済みにする」を押してください。</p></section><div className="assistant-list">{searchLinks.map((item,i)=>{const visited=assistantVisited.includes(item.href);return <article className={`assistant-card${assistantOpened===item.href?" active":""}${visited?" done":""}`} key={item.href}><div className="assistant-card-index">{String(i+1).padStart(2,"0")}</div><div className="assistant-card-body"><div className="assistant-card-heading"><div><span className="eyebrow">{item.meta}</span><h2>{item.title}</h2></div><span className={`assistant-status${visited?" done":""}`}>{visited?"確認済み":"未確認"}</span></div><p>{item.description}</p><span className="source-domain">{new URL(item.href).hostname}</span><div className="actions"><a className="button primary" href={item.href} target="_blank" rel="noopener noreferrer" onClick={()=>setAssistantOpened(item.href)}>{visited?"もう一度開く":"公式サイトを開く"}<ArrowUpRight size={17}/></a><button className="button secondary" type="button" aria-pressed={visited} onClick={()=>setAssistantVisited(v=>visited?v.filter(href=>href!==item.href):[...v,item.href])}>{visited?"未確認に戻す":"確認済みにする"}<ClipboardCheck size={17}/></button><button className="button secondary" type="button" onClick={()=>openEditor(undefined,{officialUrl:item.href,notes:`調査先：${item.title}\n検索キーワード：${assistantKeyword}\n`})}><Plus size={17}/>案件を登録</button></div></div></article>})}</div></>}
 {(view==="collected"||(view==="collection-status"&&searchMounted))&&<div hidden={view!=="collected"}><Tabs value={collectionMode} onValueChange={value=>setCollectionMode(value as CollectionMode)} className="collection-tabs">
 <TabsList data-tour="audience" className="collection-mode-tabs" aria-label="案件を探す対象">{searchModes.map(mode=>{const presentation=modePresentation[mode.id];return <TabsTrigger key={mode.id} value={mode.id} data-mode={mode.id} aria-label={mode.label}><span className="mode-icon"><presentation.icon size={24}/></span><span className="mode-copy"><strong>{mode.label}</strong><small>{presentation.hint}</small></span><Check className="mode-selected" size={19} aria-hidden="true"/></TabsTrigger>;})}</TabsList>
 {searchModes.map(mode=>{return <TabsContent value={mode.id} key={mode.id} className="collection-mode-content">
 <DiscoveryWorkspace onManage={manageCandidate} mode={mode.id} onStatus={discoveryStatus} initialKeyword={collectionStates[mode.id].keyword===mode.defaultKeyword?"":collectionStates[mode.id].keyword} onKeywords={()=>navigate("keywords")}/>
 {mode.id==="engineer"&&<details className="panel engineer-references"><summary>参考案件を見る（ご共有の3件）</summary><p className="engineer-search-target">検討時の目安：案件規模250万〜800万円。金額・開発工数・保守範囲は公告ごとに確認。</p><p className="section-description">類似案件の業務範囲・仕様を確認するための参考例です。募集終了した案件を含みます。</p><ul>{engineerReferences.map(reference=><li key={reference.href}><a href={reference.href} target="_blank" rel="noopener noreferrer"><span><small>{reference.agency}</small><strong>{reference.title}</strong></span><ArrowUpRight size={18}/></a></li>)}</ul></details>}
 </TabsContent>;})}
 </Tabs></div>}
 {view==="keywords"&&<><div className="filter-bar"><label className="search-input"><Search size={18}/><Input aria-label="キーワードを絞り込み" placeholder="語句・分類名で絞り込み" value={keywordQuery} onChange={e=>setKeywordQuery(e.target.value)}/></label>{copyButton(keywordGroups.flatMap(g=>g.keywords).join("\n"),"all-keywords",`全${keywordGroups.reduce((count,group)=>count+group.keywords.length,0)}語をコピー`)}</div>{visibleKeywordGroups.length===0&&<section className="panel keyword-empty" role="status"><h2>該当するキーワードがありません</h2><p>短い語句や別の呼び方で検索するか、絞り込みを解除してください。</p><button type="button" className="button secondary" onClick={()=>setKeywordQuery("")}>絞り込みを解除</button></section>}<div className="keyword-grid">{visibleKeywordGroups.map((g,i)=><article className="panel keyword-panel" key={g.title}><div className="panel-heading"><div><p className="eyebrow">{g.keywords.length} KEYWORDS</p><h2>{g.title}</h2></div>{copyButton(g.keywords.join("\n"),`group-${i}`,"一覧")}</div><p>{g.description}</p><div className="keyword-chips">{g.keywords.filter(k=>!normalizedKeywordQuery||g.title.toLowerCase().includes(normalizedKeywordQuery)||k.toLowerCase().includes(normalizedKeywordQuery)).map(k=><button onClick={()=>copy(k,k)} key={k}>{copied===k?<Check size={14}/>:null}{k}</button>)}</div><button className="text-button" onClick={()=>{setAssistantKeyword(g.keywords.join("、"));navigate("collected");}}>この分野の案件を探す<Search size={16}/></button></article>)}</div><section className="panel"><div className="panel-heading"><h2>検索語の組み合わせ例</h2><span className="muted">クリックでコピー</span></div><div className="keyword-chips">{searchExamples.map(s=><button key={s} onClick={()=>copy(s,s)}>{s}<Copy size={14}/></button>)}</div></section></>}
 {view==="signatures"&&<Tabs defaultValue="kotera" className="signature-tabs"><TabsList className="person-tabs" aria-label="署名の担当者">{Object.entries(signatureProfiles).map(([key,p])=><TabsTrigger value={key} key={key}>{p.name}<small>{p.tabLabel}</small></TabsTrigger>)}</TabsList>{Object.entries(signatureProfiles).map(([key,p])=><TabsContent value={key} key={key}><div className="signature-grid"><article className="panel signature-card"><p className="eyebrow">LUCIA</p><h2>{p.luciaTitle}</h2><p>{p.luciaDescription}</p><pre>{p.luciaText}</pre>{copyButton(p.luciaText,`${key}-lucia`,"LUCIA署名をコピー","button primary")}</article><article className="panel signature-card"><p className="eyebrow">SFL</p><h2>{p.sflTitle}</h2><p>{p.sflDescription}</p><pre>{p.sflText}</pre>{copyButton(p.sflText,`${key}-sfl`,"SFL署名をコピー","button primary")}</article></div></TabsContent>)}<p className="form-hint">必要に応じてメールアドレス・電話番号を追記してから送信してください。</p></Tabs>}
 {view==="settings"&&<><MembershipSettings session={session} signInUrl={signInUrl}/>{session.role==="owner"&&<details className="panel"><summary>担当者の登録・管理</summary><section className="panel"><div className="panel-heading"><h3>ChatGPT利用者・担当者の一覧</h3><span className="muted">{session?.members.length}名</span></div><ErrorBox message={memberError}/><div className="member-list">{session?.members.map(m=><div key={m.email}><span className="avatar">{m.name.slice(0,1)}</span><div><strong>{m.name}</strong><small>{m.email}</small></div><span className="pill">{m.role==="owner"?"管理者":"メンバー"}</span>{session.role==="owner"&&m.role!=="owner"&&<button className="icon-button" aria-label={`${m.name}をメンバー一覧から削除`} onClick={()=>setRemoving(m)}><X size={17}/></button>}</div>)}</div>{session?.role==="owner"&&<form onSubmit={addMember} className="member-form"><h3>メンバーを登録</h3><p>案件の担当者に使う氏名・メールアドレスを登録します。この操作だけでは会員ログインIDは発行されません。</p><div className="form-grid"><Field label="氏名"><Input required maxLength={100} value={memberName} onChange={e=>setMemberName(e.target.value)}/></Field><Field label="メールアドレス"><Input required type="email" maxLength={250} value={memberEmail} onChange={e=>setMemberEmail(e.target.value)}/></Field></div><button className="button primary" disabled={memberBusy} type="submit"><Users size={18}/>メンバーを登録</button><small>メールは自動送信されません。案件検索用のIDは「会員ログインの管理」で発行してください。</small></form>}</section></details>}</>}
 </>
 </main></SidebarInset>
 <Sheet open={searchAllowed&&editor!==null} onOpenChange={open=>{if(!open&&!saving)setEditor(null);}}><SheetContent className="bid-editor" showCloseButton={!saving}><SheetHeader><SheetTitle>{editor==="new"?"案件を登録":"案件の詳細・編集"}</SheetTitle><SheetDescription>公告を確認し、参加条件と次にすることを記録します。</SheetDescription></SheetHeader><BidEditorForm draft={draft} members={session?.members??[]} saving={saving} error={saveError} onChange={updateDraft} onSave={save} onClose={()=>setEditor(null)}/></SheetContent></Sheet>
 <AlertDialog open={!!removing} onOpenChange={open=>{if(!open&&!memberBusy)setRemoving(null);}}><AlertDialogContent><AlertDialogTitle>メンバー一覧から削除しますか？</AlertDialogTitle><AlertDialogDescription>{removing?.name}さんを一覧から削除します。会員IDの利用停止は「会員ログインの管理」で行ってください。登録済みの案件は残ります。</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={memberBusy}>戻る</AlertDialogCancel><AlertDialogAction disabled={memberBusy} onClick={e=>{e.preventDefault();removeMember();}}>一覧から削除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 {onboarding.active&&<PortalTour step={onboarding.step} view={view} onNext={onboarding.next} onBack={onboarding.back} onPause={onboarding.pause} onReturn={()=>navigate(onboardingSteps[onboarding.step].view)}/>}
 <Toaster position="bottom-center" theme="light" closeButton/>
 </PortalDisplayProvider>;
}
