import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {fileURLToPath} from 'node:url';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({configFile:false,appType:'custom',root,resolve:{alias:{'@':root}},plugins:[{
 name:'isolate-unrelated-workspace-tools',enforce:'pre',
 resolveId(id){if(['./procurement-tools','./lark-registration'].includes(id))return '\0search-ui'+id;},
 load(id){
  if(id==='\0search-ui./procurement-tools')return 'export const workbenchRequest=async()=>({profile:{}});export const SearchTools=()=>null;export const CandidateSheet=(props)=>{globalThis.searchUiSheet=props;return null;};';
  if(id==='\0search-ui./lark-registration')return 'export const useLarkRegistration=()=>({rows:{},configured:false,checking:false});export const LarkRegistrationAction=()=>null;export const LarkConnectionPanel=()=>null;';
 }
}],server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,HTMLFormElement:window.HTMLFormElement,HTMLInputElement:window.HTMLInputElement,Node:window.Node,Event:window.Event,MutationObserver:window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:callback=>setTimeout(callback,0),cancelAnimationFrame:clearTimeout,getComputedStyle:()=>({display:'block',animationName:'none',animationDuration:'0s'})});
const {DiscoveryWorkspace}=await vite.ssrLoadModule('/app/discovery-workspace.tsx');

const fixtureRun='11111111-1111-4111-8111-111111111111';
const inspectionFor=status=>({id:fixtureRun,inspected:status==='completed'?25:0,limit:100,endsAt:Date.now()+60000,...(status==='completed'?{reason:'complete'}:{})});

test('search filter form exposes only multi-select prefectures and submission dates',async()=>{
 const {SearchTools}=await vite.ssrLoadModule('/app/procurement-tools.tsx');
 const {defaultAdvancedSearch,emptyCompanyProfile}=await vite.ssrLoadModule('/lib/procurement-workbench.ts');
 const originalFetch=globalThis.fetch,originalResizeObserver=globalThis.ResizeObserver;let applied;
 const checkedDescriptor=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'checked');
 // Linkedom has no layout observer or native checkbox property descriptor.
 globalThis.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};
 if(!checkedDescriptor)Object.defineProperty(window.HTMLInputElement.prototype,'checked',{configurable:true,get(){return this.hasAttribute('checked');},set(value){this.toggleAttribute('checked',!!value);}});
 globalThis.fetch=async()=>Response.json({profile:emptyCompanyProfile,searches:[]});
 const current={mode:'sfl',source:'all',category:'all',keywords:'研修',exclude:'',newOnly:false,filters:{...defaultAdvancedSearch,synonyms:'off'}};
 const mounted=createRoot(document.getElementById('root'));
 try{
  await act(async()=>mounted.render(React.createElement(SearchTools,{mode:'sfl',current,onApply:value=>{applied=value;},onProfile:()=>{}})));
  const form=document.querySelector('.search-filters form');
  assert.deepEqual([...form.children].filter(node=>node.tagName==='FIELDSET').map(node=>node.querySelector('legend').textContent),['都道府県別','提出期限を設定']);
  assert.equal(form.querySelectorAll('[role="checkbox"]').length,47);assert.equal(form.querySelectorAll('input[type="date"]').length,2);assert.equal(form.querySelector('select'),null);
  assert.doesNotMatch(form.textContent,/発注機関|検索する範囲|キーワードの条件|公告日|掲載する期間|並び順/);
  const choice=name=>[...form.querySelectorAll('.prefecture-options label')].find(label=>label.textContent===name).querySelector('[role="checkbox"]');
  await act(async()=>choice('滋賀県').click());await act(async()=>choice('京都府').click());
  assert.equal(choice('滋賀県').getAttribute('aria-checked'),'true');assert.equal(choice('京都府').getAttribute('aria-checked'),'true');
  assert.match(form.querySelector('.prefecture-selection').textContent,/滋賀県・京都府/);
  await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(applied.filters.region,'滋賀県、京都府');assert.equal(applied.filters.synonyms,'off');
  await act(async()=>choice('滋賀県').click());
  await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(applied.filters.region,'京都府');
  await act(async()=>[...form.querySelectorAll('button')].find(button=>button.textContent==='詳細条件を解除').click());
  assert.equal(applied.filters.region,'');assert.equal(applied.filters.deadlineFrom,'');assert.equal(applied.filters.deadlineTo,'');assert.equal(applied.filters.synonyms,'off');
  assert.equal(form.querySelectorAll('[role="checkbox"][aria-checked="true"]').length,0);
 }finally{await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;globalThis.ResizeObserver=originalResizeObserver;if(!checkedDescriptor)delete window.HTMLInputElement.prototype.checked;}
});

test('status page reads progress without starting searches, retains details and recovers from errors',async()=>{
 const {default:DiscoveryStatus}=await vite.ssrLoadModule('/app/discovery-status.tsx');
 const originalFetch=globalThis.fetch,originalTimeout=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 const timers=new Map();let nextTimer=-1,calls=0,fail=false,returned=false;
 globalThis.setTimeout=(fn,delay,...args)=>{if(delay>=1000){const id=nextTimer--;timers.set(id,{fn,delay});return id;}return originalTimeout(fn,delay,...args);};
 globalThis.clearTimeout=id=>{if(timers.has(id))timers.delete(id);else originalClear(id);};
 const progress={status:'running',updatedAt:Date.now(),processed:1929,pending:1340,saved:11454,message:'一部の取得先・検索条件は未確認です。結果は順次保存されています。',sources:[
  {name:'官公需 API',processed:344,pending:237,issues:[],officialUrl:'https://www.kkj.go.jp/s/'},
  {name:'陸上自衛隊',processed:849,pending:0,issues:['未確認のページがあります'],officialUrl:'https://www.mod.go.jp/gsdf/',pageIssues:[{title:'未取得の公告',url:'https://www.mod.go.jp/gsdf/notice.pdf',parentUrl:'https://www.mod.go.jp/gsdf/',message:'公式ページで確認してください。'}],targets:[{name:'検証部隊',url:'https://www.mod.go.jp/gsdf/',state:'partial',visited:1,pending:0}]},
 ]};
 globalThis.fetch=async(path,options={})=>{
  calls++;assert.equal(path,'/api/discovery/progress');assert.ok(!options.method||options.method==='GET','viewing status must not start or advance the collector');
  assert.equal(options.cache,'no-store');
  return fail?Response.json({error:'一時的に読み込めませんでした。'},{status:500}):Response.json({progress});
 };
 const mounted=createRoot(document.getElementById('root'));
 const tick=async()=>{assert.equal(timers.size,1);const [id,timer]=[...timers][0];timers.delete(id);await act(async()=>timer.fn());};
 try{
  await act(async()=>mounted.render(React.createElement(DiscoveryStatus,{onSearch:()=>{returned=true;}})));
  assert.equal(calls,1);assert.equal([...timers.values()][0].delay,5000);
  const page=()=>document.querySelector('.discovery-status-page');
  assert.deepEqual([...page().querySelectorAll('dt')].map(node=>node.textContent),['処理済み','処理待ち','保存した案件']);
  assert.match(page().textContent,/1,929/);assert.match(page().textContent,/11,454/);
  assert.doesNotMatch(page().textContent,/一部の取得先・検索条件は未確認です/);
  assert.match(page().textContent,/官公需 API|陸上自衛隊/);
  assert.ok(page().querySelector('a[href="https://www.mod.go.jp/gsdf/notice.pdf"]'));
  assert.ok(page().querySelector('.discovery-coverage summary'));
  assert.equal(page().querySelector('.discovery-status-operation').hasAttribute('open'),false);
  fail=true;await tick();
  assert.match(page().querySelector('[role="alert"]').textContent,/直前に読み込めた状況/);
  assert.match(page().textContent,/11,454/,'temporary errors retain the last real snapshot');
  fail=false;progress.saved=11455;
  await act(async()=>[...page().querySelectorAll('button')].find(button=>button.textContent==='更新').click());
  assert.equal(page().querySelector('[role="alert"]'),null);assert.match(page().textContent,/11,455/);assert.equal(timers.size,1);
  await act(async()=>[...page().querySelectorAll('button')].find(button=>button.textContent==='案件を探す').click());
  assert.ok(returned);
 }finally{
  await act(async()=>mounted.unmount());assert.equal(timers.size,0,'leaving status cancels polling');
  globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;
 }
});

test('settings navigation keeps an active search alive while showing its status and restores the same results view',async()=>{
 const {default:BidApp}=await vite.ssrLoadModule('/app/bid-app.tsx');
 const {SidebarProvider}=await vite.ssrLoadModule('/components/ui/sidebar.tsx');
 const originalFetch=globalThis.fetch,originalTimeout=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 const timers=new Map();let nextTimer=-1,starts=0,steps=0,status='idle';
 window.location={hash:'#collected'};window.history={replaceState(_state,_title,hash){window.location.hash=hash;}};
 window.scrollTo=()=>{};window.innerWidth=1200;
 window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 globalThis.setTimeout=(fn,delay,...args)=>{if(delay>=1000){const id=nextTimer--;timers.set(id,{fn,delay});return id;}return originalTimeout(fn,delay,...args);};
 globalThis.clearTimeout=id=>{if(timers.has(id))timers.delete(id);else originalClear(id);};
 const session={role:'member',user:{id:'account:fixture',email:'',name:'Member'},members:[],membership:{allowed:true,kind:'member',loginId:'fixture'}};
 const progress=()=>({inspection:inspectionFor(status),status,startedAt:1,updatedAt:Date.now(),nextAt:Date.now()+5000,resultRevision:0,processed:steps,pending:10,saved:0,sources:[],message:''});
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/workspace')return Response.json(session);
  if(options.method==='POST'){const action=JSON.parse(options.body).action;if(action==='start'){starts++;status='running';}if(action==='step')steps++;return Response.json({runId:fixtureRun,progress:progress()});}
  if(path==='/api/discovery/progress')return Response.json({runId:fixtureRun,progress:progress()});
  return Response.json({items:[],total:0,counts:{all:0,recommended:0,related:0,attention:0,reviewed:0},offset:0,today:'2026-09-18',progress:progress()});
 };
 const mounted=createRoot(document.getElementById('root'));
 try{
  await act(async()=>mounted.render(React.createElement(SidebarProvider,null,React.createElement(BidApp,{initialSession:session,signInUrl:'/login',signOutUrl:'/logout'}))));
  assert.equal(document.querySelector('main').getAttribute('data-view'),'collected');
  const workspace=document.querySelector('.discovery-workspace');
  const toggle=document.querySelector('.portal-sidebar-toggle');
  assert.equal(toggle.getAttribute('aria-expanded'),'true');
  assert.equal(toggle.getAttribute('aria-label'),'メニューを閉じる');
  await act(async()=>toggle.click());
  assert.equal(toggle.getAttribute('aria-expanded'),'false');
  assert.equal(toggle.getAttribute('aria-label'),'メニューを開く');
  assert.ok(document.querySelector('[data-slot="sidebar"][data-collapsible="offcanvas"]'));
  assert.equal(document.querySelector('.discovery-workspace'),workspace,'closing navigation preserves the current page');
  await act(async()=>toggle.click());
  assert.equal(toggle.getAttribute('aria-expanded'),'true');
  assert.ok(document.querySelector('[data-slot="sidebar"][data-state="expanded"]'));
  await act(async()=>workspace.querySelector('.discovery-refresh-button').click());
  assert.equal(starts,1);assert.equal(steps,1);
  await act(async()=>[...document.querySelectorAll('.sidebar-nav-toggle')].find(button=>button.textContent==='設定・仕様').click());
  await act(async()=>[...document.querySelectorAll('[data-slot="sidebar-menu-button"]')].find(button=>button.textContent==='公告の取得状況').click());
  assert.equal(document.querySelector('main').getAttribute('data-view'),'collection-status');
  assert.equal(window.location.hash,'#collection-status');
  assert.equal(document.querySelector('.discovery-workspace'),workspace,'navigation preserves the running workspace instance');
  assert.ok(workspace.closest('[hidden]'),'search is hidden on the status page');
  assert.ok(document.querySelector('.discovery-status-page'));
  const scheduled=[...timers];
  for(const [id,timer] of scheduled){if(timer.delay>=4000&&timer.delay<=5000){timers.delete(id);await act(async()=>timer.fn());}}
  assert.ok(steps>=2,'collection continues while its status is visible');
  await act(async()=>[...document.querySelectorAll('.discovery-status-page button')].find(button=>button.textContent==='案件を探す').click());
  assert.equal(document.querySelector('main').getAttribute('data-view'),'collected');
  assert.equal(document.querySelector('.discovery-workspace'),workspace);assert.equal(workspace.closest('[hidden]'),null);
  assert.equal(starts,1,'returning does not start a second search');assert.equal(document.querySelector('.discovery-status-page'),null);
 }finally{
  await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;
  delete window.location;delete window.history;delete window.matchMedia;delete window.scrollTo;
 }
});

test('collection polling keeps current cards, skips unchanged searches, and refreshes changed results',async()=>{
 const originalFetch=globalThis.fetch,originalTimeout=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 const timers=new Map();let nextTimer=-1,gets=0,steps=0,status='idle',saved=0,resultRevision=0;
 globalThis.setTimeout=(fn,delay,...args)=>{
  if(delay>=1000){const id=nextTimer--;timers.set(id,{fn,delay});return id;}
  return originalTimeout(fn,delay,...args);
 };
 globalThis.clearTimeout=id=>{if(timers.has(id))timers.delete(id);else originalClear(id);};
 const progress=()=>({inspection:inspectionFor(status),status,startedAt:1,nextAt:Date.now()+5000,resultRevision,processed:steps,pending:20,saved,sources:[],message:''});
 globalThis.fetch=async(path,options={})=>{
  if(options.method==='POST'){
   const body=JSON.parse(options.body);
   if(body.action==='start'){status='running';assert.match(body.keywords,/生成AI/,'an empty input prioritizes the current tab fields');}
   if(body.action==='step'){steps++;if(steps>=3){saved=1;resultRevision=1;}if(steps>=4)resultRevision=2;if(steps>=5)status='completed';}
   return Response.json({runId:fixtureRun,progress:progress()});
  }
  gets++;
  const items=saved?[{id:'saved',title:'新しい研修案件',agency:'国の機関',deadline:'2099-09-30',officialUrl:'https://example.go.jp/notice',sourceUrl:'https://example.go.jp/',source:'公式公告',summary:'',matchedKeywords:['研修'],classification:{openCounterEvidence:'オープンカウンター'}}]:[];
  return Response.json({items,total:items.length,counts:{all:items.length,recommended:items.length,related:0,attention:0,reviewed:0},offset:0,today:'2026-09-18',progress:progress()});
 };
 const mounted=createRoot(document.getElementById('root'));
 const advance=async()=>{
  assert.equal(timers.size,2,'only one collector timer is active');
  const [id,timer]=[...timers].find(([,t])=>t.delay<=6500);assert.ok(timer.delay>=4000&&timer.delay<=5000);
  timers.delete(id);await act(async()=>timer.fn());
 };
 try{
  await act(async()=>mounted.render(React.createElement(DiscoveryWorkspace,{mode:'sfl'})));
  await act(async()=>document.querySelector('.discovery-refresh-button').click());
  assert.equal(steps,1);const initialGets=gets;
  assert.equal(document.querySelector('.discovery-refresh-button').textContent.trim(),'最新情報を取得中…');
  assert.equal(document.querySelector('.discovery-panel-status').textContent,'0件 · 公告を追加取得中','the saved search has completed even while more notices are being collected');
  assert.equal(document.querySelector('.discovery-progress'),null,'operational details have moved out of search results');
  await advance();assert.equal(steps,2);assert.equal(gets,initialGets,'unchanged progress does not search the corpus again');
  await advance();assert.equal(steps,3);assert.equal(gets,initialGets+1);assert.match(document.querySelector('.discovery-results').textContent,/新しい研修案件/);
  assert.equal(document.querySelector('.discovery-panel-status').textContent,'1件 · 公告を追加取得中');
  await advance();assert.equal(steps,4);assert.equal(gets,initialGets+2,'a retrieval warning refreshes details even when the saved count stays the same');
  await advance();assert.equal(steps,5);assert.equal(gets,initialGets+3);assert.equal(timers.size,0,'terminal progress stops polling');
 }finally{
  await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;
 }
});

test('stalled saved queries and collection steps time out, retain results and allow an explicit retry',async()=>{
 const originalFetch=globalThis.fetch,originalTimeout=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 const timers=new Map();let nextTimer=-1,hang='query',gets=0,starts=0,status='running',aborted=0;
 const reported=[];
 globalThis.setTimeout=(fn,delay,...args)=>{if(delay>=1000){const id=nextTimer--;timers.set(id,{fn,delay});return id;}return originalTimeout(fn,delay,...args);};
 globalThis.clearTimeout=id=>{if(timers.has(id))timers.delete(id);else originalClear(id);};
 const progress=()=>({inspection:inspectionFor(status),status,startedAt:1,resultRevision:1,processed:1,pending:10,saved:1,sources:[],message:''});
 const stall=signal=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(new DOMException('Aborted','AbortError'));},{once:true}));
 globalThis.fetch=async(path,options={})=>{
  if(options.method==='POST'){
   const {action}=JSON.parse(options.body);
   if(action==='start'){starts++;status='running';}
   if(action==='step'){if(hang==='step')return stall(options.signal);status='completed';}
   return Response.json({runId:fixtureRun,progress:progress()});
  }
  gets++;if(hang==='query')return stall(options.signal);
  const item={id:'saved',title:'DX研修の保存案件',agency:'国の機関',deadline:'2099-09-30',officialUrl:'https://example.go.jp/notice',sourceUrl:'https://example.go.jp/',source:'公式公告',summary:'',matchedKeywords:['DX'],classification:{openCounterEvidence:'オープンカウンター'}};
  return Response.json({items:[item],total:1,counts:{all:1,recommended:1,related:0,attention:0,reviewed:0},offset:0,today:'2026-09-18',progress:progress()});
 };
 const mounted=createRoot(document.getElementById('root'));
 const timeout=async delay=>{const timer=[...timers].find(([,t])=>delay===60000?t.delay>59000&&t.delay<=60000:t.delay===delay);assert.ok(timer,'request has a bounded deadline');timers.delete(timer[0]);await act(async()=>timer[1].fn());};
 try{
  await act(async()=>mounted.render(React.createElement(DiscoveryWorkspace,{mode:'sfl',initialKeyword:'DX',onStatus:(_mode,_feed,_source,collecting)=>reported.push(collecting)})));
  assert.equal(document.querySelector('.discovery-results').getAttribute('aria-busy'),'true');
  await timeout(30000);
  assert.equal(document.querySelector('.discovery-results').getAttribute('aria-busy'),'false');
  assert.match(document.querySelector('[role="alert"]').textContent,/通信の応答を確認できません/);
  assert.equal(document.querySelector('.discovery-panel-status').textContent,'読み込みエラー');
  assert.doesNotMatch(document.querySelector('.discovery-empty').textContent,/候補はありません/);
  hang='';await act(async()=>document.querySelector('.discovery-search form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(gets,2,'the unchanged DX query can be retried');assert.equal(starts,0,'saved search never starts collection');
  assert.equal(document.querySelector('[role="alert"]'),null);
  assert.match(document.querySelector('.discovery-results').textContent,/DX研修の保存案件/);
  assert.equal(reported.at(-1),false,'persisted running state does not pretend this page is collecting');
  hang='step';await act(async()=>document.querySelector('.discovery-refresh-button').click());
  assert.equal(reported.at(-1),true);
  await timeout(60000);
  assert.equal(aborted,2);assert.equal(timers.size,0,'timed-out collection does not keep polling');
  assert.equal(document.querySelector('.discovery-start-button').disabled,false);
  assert.equal(reported.at(-1),false,'the navigator stops showing collection after a timeout');
  assert.equal(document.querySelector('[role="alert"]'),null);assert.match(document.querySelector('.discovery-results').textContent,/60秒で調査を一区切り/);
  assert.match(document.querySelector('.discovery-results').textContent,/DX研修の保存案件/,'a failed step retains real search results');
  assert.equal(document.querySelector('.discovery-panel-status').textContent,'1件');
  hang='';await act(async()=>document.querySelector('.discovery-refresh-button').click());
  assert.equal(starts,2);assert.equal(document.querySelector('[role="alert"]'),null);
  assert.equal(document.querySelector('.discovery-refresh-button').textContent.trim(),'最新情報を取得');
 }finally{
  await act(async()=>mounted.unmount());assert.equal(timers.size,0);
  globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;
 }
});

test('a 100-notice batch stops with fewer matches, shows twelve cards and resumes only on explicit re-search',async()=>{
 const originalFetch=globalThis.fetch;let total=0,steps=0,status='idle',runId=fixtureRun;const starts=[],runs=[];
 const items=Array.from({length:12},(_,i)=>({id:'quota-'+i,title:'DX研修 '+i,agency:'確認機関',officialUrl:'https://example.go.jp/'+i,deadline:'2099-09-30',matchedKeywords:['DX'],classification:{unifiedEligibleEvidence:'全省庁統一資格'}}));
 const progress=()=>({status,inspection:{id:runId,inspected:status==='paused'?100:0,limit:100,endsAt:Date.now()+60000,...(status==='paused'?{reason:'limit'}:{})},startedAt:1,processed:steps,pending:1000,saved:total,resultRevision:total,sources:[],message:''});
 globalThis.fetch=async(path,options={})=>{
  if(options.method==='POST'){
   const body=JSON.parse(options.body);
   if(body.action==='start'){starts.push(body);runId=crypto.randomUUID();status='running';total=0;}
   if(body.action==='step'){assert.equal(body.runId,runId);steps++;total=27;status='paused';}
   return Response.json({runId,progress:progress()});
  }
  runs.push(new URL(path,'https://portal.example.test').searchParams.get('runId'));
  return Response.json({items:total?items:[],total,counts:{all:total,recommended:total,related:0,attention:0,reviewed:0},offset:0,today:'2026-09-19',progress:progress()});
 };
 const mounted=createRoot(document.getElementById('root'));
 try{
  await act(async()=>mounted.render(React.createElement(DiscoveryWorkspace,{mode:'sfl',initialKeyword:'DX'})));
  const submit=()=>document.querySelector('.discovery-refresh-button').click();
  await act(async()=>submit());
  assert.equal(steps,1);assert.equal(starts.length,1);
  assert.equal(new URLSearchParams(starts[0].batch.search).get('keywords'),'DX');
  assert.equal(document.querySelectorAll('.opportunity-card').length,12);
  assert.match(document.querySelector('.discovery-results').textContent,/公告の確認：100／100件/);
  assert.match(document.querySelector('.discovery-panel-status').textContent,/27件/);
  assert.equal(document.querySelector('.discovery-start-button').disabled,false);
  assert.doesNotMatch(document.querySelector('.discovery-panel-status').textContent,/取得中/);
  assert.equal(runs.at(-1),null,'saved searches are independent of the collection batch');const firstRun=runId;
  await act(async()=>submit());assert.equal(starts.length,2);assert.equal(steps,2);
  assert.notEqual(runId,firstRun);assert.equal(runs.at(-1),null,'saved searches are independent of the collection batch');
  assert.equal(document.querySelectorAll('.opportunity-card').length,12);
 }finally{await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;}
});

test('ordinary search and extra saved results remain usable during external retrieval',async()=>{
 const originalFetch=globalThis.fetch;let posts=0,gets=0,completeStep;
 const items=Array.from({length:12},(_,i)=>({id:'parallel-'+i,title:'DX研修 '+i,agency:'国の機関',deadline:'2099-09-30',officialUrl:'https://example.go.jp/'+i,summary:'',matchedKeywords:['DX'],classification:{unifiedEligibleEvidence:'全省庁統一資格'}}));
 const progress=status=>({status,inspection:inspectionFor(status),processed:0,pending:1,saved:0,sources:[],message:''});
 globalThis.fetch=async(path,options={})=>{
  if(options.method==='POST'){
   posts++;const body=JSON.parse(options.body);
   if(body.action==='step')return new Promise((resolve,reject)=>{completeStep=()=>resolve(Response.json({progress:progress('completed')}));options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
   return Response.json({runId:fixtureRun,progress:progress('running')});
  }
  gets++;const params=new URL(path,'https://portal.example.test').searchParams;
  assert.equal(params.get('runId'),null);const total=Number(params.get('candidateLimit'));
  return Response.json({items,total,counts:{all:total,recommended:total,related:0,attention:0,reviewed:0},candidateLimitReached:true,today:'2026-09-19',offset:0,progress:progress('saved')});
 };
 const mounted=createRoot(document.getElementById('root'));
 try{
  await act(async()=>mounted.render(React.createElement(DiscoveryWorkspace,{mode:'sfl',initialKeyword:'DX'})));
  const submit=()=>document.querySelector('.discovery-search form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  await act(async()=>submit());assert.equal(posts,0);assert.equal(document.querySelectorAll('.opportunity-card').length,12);
  await act(async()=>document.querySelector('.discovery-refresh-button').click());assert.equal(posts,2);
  assert.equal(document.querySelectorAll('.opportunity-card').length,12,'fetching does not clear saved cards');
  assert.equal(document.querySelector('.discovery-start-button').disabled,false,'saved search stays enabled');
  const before=gets;await act(async()=>submit());assert.ok(gets>before);assert.equal(posts,2,'search neither pauses nor starts the collector');
  assert.equal(document.querySelector('.discovery-refresh-button').textContent.trim(),'最新情報を取得中…');
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='保存済みからさらに100件表示').click());
  assert.equal(posts,2);assert.match(document.querySelector('.discovery-pagination').textContent,/200件/);
  await act(async()=>completeStep());
  assert.equal(document.querySelectorAll('.opportunity-card').length,12);
  assert.equal(document.querySelector('.discovery-refresh-button').textContent.trim(),'最新情報を取得');
 }finally{await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;}
});

test('result groups and pages use one complete snapshot without new searches, and load full details only on demand',async()=>{
 const originalFetch=globalThis.fetch,calls=[];
 const candidates=Array.from({length:31},(_,i)=>({id:i.toString(16).padStart(64,'0'),title:`研修案件 ${i}`,agency:'国の機関',officialUrl:`https://example.go.jp/group/${i}`,sourceUrl:'https://www.kkj.go.jp/s/',source:'公式公告',deadline:i===30?'':'2099-09-30',summary:'公告の全文',descriptionText:'参加資格と提出方法の全文',matchedKeywords:['研修'],matchLocation:i===28?'body':'title',review:i===29?'reviewed':'new',fingerprint:'version-'+i,classification:{...(i<13?{unifiedEligibleEvidence:'全省庁統一資格を有する者。'}:{}),...(i===0||i>=13?{openCounterEvidence:'オープンカウンター方式。'}:{})}}));
 const pool=candidates.map(({descriptionText,...item})=>({...item,summary:'',previewOnly:true}));
 const snapshot={items:candidates.slice(0,12),pool,counts:{all:31,recommended:28,related:1,attention:1,reviewed:1},total:31,offset:0,today:'2026-09-19',progress:{status:'saved',processed:0,pending:0,saved:31,sources:[],message:''}};
 let failDetail=false,deferDetail=false,resolveDetail;
 globalThis.fetch=async(path,options={})=>{
  calls.push({path,method:options.method||'GET'});
  assert.equal(options.method,'GET','grouping must never start external collection');
  const params=new URL(path,'https://portal.example.test').searchParams;
  assert.equal(params.get('category'),'all');assert.equal(params.get('bucket'),'all');assert.equal(params.get('offset'),'0');
  if(params.has('itemId')){
   assert.equal(params.get('includePool'),'0');
   if(failDetail)return Response.json({error:'詳細の取得を再試行してください。'},{status:503});
   if(deferDetail)await new Promise(resolve=>{resolveDetail=resolve;});
   return Response.json({...snapshot,pool:undefined,items:candidates.filter(item=>item.id===params.get('itemId'))});
  }
  assert.equal(params.get('includePool'),'1');return Response.json(snapshot);
 };
 const mounted=createRoot(document.getElementById('root'));
 const group=category=>document.querySelector(`[data-category="${category}"]`);
 const view=label=>[...document.querySelectorAll('.discovery-views button')].find(button=>button.textContent.startsWith(label));
 const page=()=>document.querySelector('.discovery-pagination');
 const titles=()=>[...document.querySelectorAll('.opportunity-card h3')].map(node=>node.textContent);
 try{
  await act(async()=>mounted.render(React.createElement(DiscoveryWorkspace,{mode:'sfl',initialKeyword:'研修'})));
  await act(async()=>document.querySelector('.discovery-search form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  const searches=calls.length;
  assert.match(page().textContent,/1–12 \/ 31件/);
  await act(async()=>group('open-counter').click());
  assert.match(page().textContent,/1–12 \/ 19件/);assert.equal(view('全件').textContent,'全件19');
  assert.deepEqual(titles(),[0,...Array.from({length:11},(_,i)=>i+13)].map(i=>`研修案件 ${i}`));
  await act(async()=>page().querySelectorAll('button')[1].click());
  assert.match(page().textContent,/13–19 \/ 19件/);assert.equal(document.querySelectorAll('.opportunity-card').length,7);
  await act(async()=>group('unified-required').click());
  assert.match(page().textContent,/1–12 \/ 13件/);assert.equal(view('全件').textContent,'全件13');
  assert.ok(titles().includes('研修案件 0'),'a notice with both classifications remains in both groups');
  await act(async()=>page().querySelectorAll('button')[1].click());
  assert.match(page().textContent,/13–13 \/ 13件/);assert.deepEqual(titles(),['研修案件 12']);
  await act(async()=>view('要確認').click());
  assert.equal(document.querySelectorAll('.opportunity-card').length,0);assert.match(page().textContent,/0件/);
  await act(async()=>group('all').click());
  assert.match(page().textContent,/1–1 \/ 1件/);assert.deepEqual(titles(),['研修案件 30']);
  await act(async()=>view('全件').click());
  assert.match(page().textContent,/1–12 \/ 31件/);assert.deepEqual(titles(),candidates.slice(0,12).map(item=>item.title));
  assert.equal(calls.length,searches,'groups, status tabs, and pagination perform no requests');
  await act(async()=>document.querySelector('.opportunity-card button').click());
  assert.equal(globalThis.searchUiSheet.item.descriptionText,'参加資格と提出方法の全文');
  assert.equal(calls.length,searches,'the initial full details are reused');
  await act(async()=>globalThis.searchUiSheet.onClose());
  await act(async()=>group('open-counter').click());
  const tableTab=[...document.querySelectorAll('[role=tab]')].find(button=>button.textContent==='一覧表');
  await act(async()=>{const event=new window.Event('mousedown',{bubbles:true});event.button=0;event.ctrlKey=false;tableTab.dispatchEvent(event);});
  assert.equal(document.querySelectorAll('.discovery-table tbody tr').length,12);
  const detailButton=()=>document.querySelectorAll('.discovery-table tbody tr')[1].querySelector('button');
  failDetail=true;await act(async()=>detailButton().click());
  assert.equal(globalThis.searchUiSheet.item.previewOnly,true);assert.match(globalThis.searchUiSheet.detailError,/再試行/);
  failDetail=false;await act(async()=>globalThis.searchUiSheet.onRetry());
  assert.equal(globalThis.searchUiSheet.item.id,candidates[13].id);assert.equal(globalThis.searchUiSheet.item.descriptionText,'参加資格と提出方法の全文');
  assert.equal(globalThis.searchUiSheet.detailError,'');
  const withDetails=calls.length;
  await act(async()=>globalThis.searchUiSheet.onClose());await act(async()=>detailButton().click());
  assert.equal(calls.length,withDetails,'reopening details uses the cache');
  await act(async()=>globalThis.searchUiSheet.onClose());
  deferDetail=true;
  await act(async()=>document.querySelectorAll('.discovery-table tbody tr')[2].querySelector('button').click());
  assert.equal(globalThis.searchUiSheet.item.previewOnly,true);
  await act(async()=>globalThis.searchUiSheet.onClose());
  await act(async()=>resolveDetail());
  assert.equal(globalThis.searchUiSheet.item,null,'an old detail response cannot reopen a closed sheet');
 }finally{await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;}
});

test('All three defense branches search saved results first and collect only with the explicit update button',async()=>{
 const originalFetch=globalThis.fetch;
 const starts=[];let status='idle',selected='msdf',steps=0;
 globalThis.fetch=async(path,options={})=>{
  assert.ok(String(path).startsWith('/api/discovery'),'search stays in the portal API');
  if(options.method==='POST'){
   const body=JSON.parse(options.body);
   if(body.action==='start'){starts.push(body);selected=body.source;status='running';}
   if(body.action==='step'){steps++;status='completed';}
   return Response.json({runId:fixtureRun,progress:{status,inspection:inspectionFor(status),processed:steps,pending:0,saved:1,sources:[],message:''}});
  }
  const items=status==='completed'?[{id:'fixture',title:'広報研修の表示確認',agency:'確認先の契約機関',officialUrl:`https://www.mod.go.jp/${selected}/notice.pdf`,sourceUrl:`https://www.mod.go.jp/${selected}/`,source:'公式公告',searchSourceId:selected,deadline:'2099-09-30',matchedKeywords:['広報'],summary:'表示のテスト',classification:{unifiedEligibleEvidence:'全省庁統一資格を有する者。'}}]:[];
  const offset=Number(new URL(path,'https://portal.example.test').searchParams.get('offset')||0);
  const candidates=items.length?Array.from({length:27},(_,i)=>({...items[0],id:'fixture-'+i,title:items[0].title+' '+i,officialUrl:items[0].officialUrl+'?id='+i})):[];
  return Response.json({items:candidates.slice(offset,offset+12),pool:candidates,counts:{all:candidates.length,recommended:candidates.length,related:0,attention:0,reviewed:0},total:candidates.length,offset,today:'2026-09-16',progress:{status,processed:steps,pending:0,saved:items.length,sources:[],message:''}});
 };
 let mounted;
 try{
  for(const [source,label] of [['msdf','海上自衛隊'],['gsdf','陸上自衛隊'],['asdf','航空自衛隊']]){
   status='idle';mounted=createRoot(document.getElementById('root'));
   await act(async()=>mounted.render(React.createElement(DiscoveryWorkspace,{mode:'sfl',initialKeyword:'広報'})));
   const searchPanel=document.querySelector('.discovery-search'),resultsPanel=document.querySelector('.discovery-results');
   assert.equal(searchPanel.tagName,'DETAILS');assert.equal(resultsPanel.tagName,'DETAILS');
   assert.equal(searchPanel.hasAttribute('open'),false);assert.equal(resultsPanel.hasAttribute('open'),false);
   const {revealDetails}=await vite.ssrLoadModule('/lib/portal-disclosures.ts');
   revealDetails(document.querySelector('[data-tour="sources"]'));
   assert.equal(searchPanel.hasAttribute('open'),true,'a guide target reveals its containing search panel');
   assert.equal(resultsPanel.hasAttribute('open'),false,'search and results open independently');
   const sourceButton=[...document.querySelectorAll('.discovery-source-grid button')].find(b=>b.querySelector('strong')?.textContent===label);
   await act(async()=>sourceButton.click());
   const form=document.querySelector('.discovery-search form'),submit=form.querySelector('[type="submit"]');
   assert.equal(submit.textContent.trim(),'検索');assert.equal(submit.getAttribute('data-tour'),'saved-search');
   const flowElements=[...form.querySelectorAll('[data-tour]')].map(el=>el.getAttribute('data-tour'));
   assert.deepEqual(flowElements,['keywords','sources','saved-search','collect'],'prepare keywords, select source, then start');
   const before=starts.length;
   await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
   assert.equal(starts.length,before,'Enter searches saved data without any external requests');
   await act(async()=>{document.querySelector('.discovery-refresh-button').click();document.querySelector('.discovery-refresh-button').click();});
   assert.equal(starts.length,before+1,'double submit does not start a second collector');
   assert.equal(resultsPanel.hasAttribute('open'),true,'starting a search reveals its results');
   assert.deepEqual({...starts.at(-1),batch:undefined},{action:'start',mode:'sfl',keywords:'広報',synonyms:'on',source,batch:undefined});assert.ok(starts.at(-1).batch.search);
   assert.ok(steps>0);assert.match(document.querySelector('.discovery-results').textContent,/広報研修の表示確認/);
   assert.equal(document.querySelectorAll('.opportunity-card').length,12,'first twelve cards shown');
   const card=document.querySelector('.opportunity-card');
   assert.deepEqual([...card.querySelectorAll('dt')].map(el=>el.textContent),['種別','案件名','募集機関名']);
   assert.equal(card.querySelectorAll('button').length,1);
   assert.equal(card.querySelector('button').textContent,'詳細');
   assert.equal(card.querySelector('.opportunity-brief'),null);
   assert.equal(card.querySelector('.opportunity-actions'),null);
   await act(async()=>card.querySelector('button').click());
   assert.equal(globalThis.searchUiSheet.item.id,'fixture-0');
   assert.ok(globalThis.searchUiSheet.renderActions,'registration and review remain in details');
   await act(async()=>globalThis.searchUiSheet.onClose());
   assert.equal(globalThis.searchUiSheet.item,null);
   const pagination=()=>document.querySelector('.discovery-pagination');
   assert.match(pagination().textContent,/1–12 \/ 27件/);
   await act(async()=>pagination().querySelectorAll('button')[1].click());
   assert.equal(document.querySelectorAll('.opportunity-card').length,12);
   assert.match(pagination().textContent,/13–24 \/ 27件/);
   await act(async()=>pagination().querySelectorAll('button')[1].click());
   assert.equal(document.querySelectorAll('.opportunity-card').length,3);
   assert.match(pagination().textContent,/25–27 \/ 27件/);
   assert.ok(pagination().querySelectorAll('button')[1].disabled);
   await act(async()=>pagination().querySelectorAll('button')[0].click());
   assert.match(pagination().textContent,/13–24 \/ 27件/);
   await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
   assert.match(pagination().textContent,/1–12 \/ 27件/,'a fresh search resets to page one');
   const tableTab=[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent==='一覧表');
   await act(async()=>{const event=new window.Event('mousedown',{bubbles:true});event.button=0;event.ctrlKey=false;tableTab.dispatchEvent(event);});
   assert.equal(document.querySelectorAll('.discovery-results .discovery-table tbody tr').length,12,'table also shows twelve results');
   const table=document.querySelector('.opportunity-table-summary');
   assert.deepEqual([...table.querySelectorAll('thead th')].map(el=>el.textContent),['種別','案件名','募集機関名','詳細']);
   const rows=table.querySelectorAll('tbody tr');
   assert.equal(rows[1].querySelectorAll('td').length,4);
   assert.equal(rows[1].querySelectorAll('button').length,1);
   assert.equal(rows[1].querySelector('button').textContent,'詳細');
   assert.equal(rows[1].querySelector('a'),null,'official links are inside the shared details sheet');
   assert.doesNotMatch(rows[1].textContent,/2099-09-30|確認済みにする|Larkへ登録/);
   await act(async()=>rows[1].querySelector('button').click());
   assert.equal(globalThis.searchUiSheet.item.id,'fixture-1','table details opens the selected row');
   assert.ok(globalThis.searchUiSheet.renderActions);
   await act(async()=>globalThis.searchUiSheet.onClose());
   assert.equal(globalThis.searchUiSheet.item,null);
   const switcher=document.querySelector('[role=switch]');
   await act(async()=>switcher.click());
   assert.equal(switcher.getAttribute('aria-checked'),'false');
   const after=starts.length,retainedTable=document.querySelector('.opportunity-table-summary');
   const retainedKeyword=document.querySelector('[id="collection-keywords-sfl"]').value;
   searchPanel.removeAttribute('open');resultsPanel.removeAttribute('open');
   assert.equal(document.querySelector('.opportunity-table-summary'),retainedTable,'collapsing retains mounted results');
   searchPanel.setAttribute('open','');
   assert.equal(document.querySelector('[id="collection-keywords-sfl"]').value,retainedKeyword,'keyword survives closing and reopening');
   await act(async()=>document.querySelector('.discovery-search form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
   assert.equal(resultsPanel.hasAttribute('open'),true,'saved-only searches also reveal results');
   assert.equal(starts.length,after,'saved-only search does not call the collector');
   await act(async()=>mounted.unmount());mounted=null;
  }
 }finally{
  if(mounted)await act(async()=>mounted.unmount());
  globalThis.fetch=originalFetch;delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;delete globalThis.searchUiSheet;
 }
});
