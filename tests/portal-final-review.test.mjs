import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';
import { parseHTML } from 'linkedom';

const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({configFile:false,appType:'custom',root,resolve:{alias:{'@':root}},server:{middlewareMode:true,hmr:false},plugins:[{
 name:'final-review-fixtures',enforce:'pre',
 resolveId(id){if(id==='./lark-registration')return '\0review-lark';},
 load(id){if(id==='\0review-lark')return 'export const useLarkRegistration=(mode)=>{globalThis.reviewLarkMode=mode;return {rows:{},configured:false,checking:false};};export const LarkRegistrationAction=()=>null;export const LarkConnectionPanel=()=>null;';},
 // Verify the real detail contents in a DOM without a layout engine. The
 // vendored modal's focus/geometry behaviour is outside this test's scope.
 transform(code,id){if(id.endsWith('/components/ui/sheet.tsx'))return `import React from 'react';export const Sheet=({open,children})=>open?React.createElement('aside',{role:'dialog'},children):null;export const SheetContent=({children,className})=>React.createElement('div',{className},children);export const SheetHeader=({children})=>React.createElement('header',null,children);export const SheetTitle=({children})=>React.createElement('h2',null,children);export const SheetDescription=({children})=>React.createElement('p',null,children);`;}
}]});
after(()=>vite.close());
const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,HTMLFormElement:window.HTMLFormElement,HTMLInputElement:window.HTMLInputElement,Node:window.Node,Event:window.Event,CustomEvent:window.CustomEvent,MutationObserver:window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,getComputedStyle:()=>({display:'block',animationName:'none',animationDuration:'0s'}),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}}});
window.HTMLElement.prototype.scrollIntoView=()=>{};
// Linkedom does not implement the native checkbox property used by Radix.
Object.defineProperty(window.HTMLInputElement.prototype,'checked',{configurable:true,get(){return this.hasAttribute('checked');},set(value){this.toggleAttribute('checked',!!value);}});
window.location={hash:'#dashboard'};window.history={replaceState(_s,_t,hash){window.location.hash=hash;}};window.scrollTo=()=>{};
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
const {emptyCompanyProfile}=await vite.ssrLoadModule('/lib/procurement-workbench.ts');
const session={role:'member',user:{id:'account:fixture',email:'',name:'Member'},members:[],membership:{allowed:true,kind:'member',loginId:'fixture'}};
const progress={status:'idle',processed:0,pending:0,saved:0,sources:[],message:''};
const emptyFeed={items:[],total:0,offset:0,today:'2026-09-18',counts:{all:0,recommended:0,related:0,attention:0,reviewed:0},progress};
const candidate={id:'review-item',title:'研修業務',agency:'確認用機関',officialUrl:'https://www.mod.go.jp/example.pdf',sourceUrl:'https://www.mod.go.jp/',source:'公式公告',deadline:'2099-09-30',review:'new',summary:'研修業務です。',descriptionText:'全省庁統一資格を有する者。',classification:{openCounterEvidence:'オープンカウンター',unifiedEligibleEvidence:'全省庁統一資格'}};

function inspectDocument(label){
 const main=document.querySelector('main');assert.ok(main?.querySelector('h1')?.textContent,label);
 const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);assert.equal(ids.length,new Set(ids).size,`${label}: duplicate IDs`);
 for(const img of document.querySelectorAll('img')){assert.ok(img.hasAttribute('alt'),`${label}: image alternative`);if(img.getAttribute('src').startsWith('/'))assert.ok(existsSync(root+'/public'+img.getAttribute('src')),`${label}: missing ${img.getAttribute('src')}`);}
 for(const link of main.querySelectorAll('a[href]'))assert.ok(!/^(javascript:|undefined$)/i.test(link.getAttribute('href')),`${label}: invalid link`);
}

test('every portal route and article renders with usable headings, unique IDs and existing images in both themes',async()=>{
 const {default:BidApp}=await vite.ssrLoadModule('/app/bid-app.tsx');
 const {portalArticles}=await vite.ssrLoadModule('/lib/portal-articles.ts');
 const {pinnedPortalArticles}=await vite.ssrLoadModule('/lib/portal-lark-articles.ts');
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(path,options={})=>{
  assert.ok(!options.method||options.method==='GET','navigation does not mutate records');
  if(path==='/api/workspace')return Response.json(session);
  if(path==='/api/procurement-workbench')return Response.json({profile:emptyCompanyProfile,searches:[]});
  if(path==='/api/discovery/progress')return Response.json({progress});
  if(path==='/api/bid-insights')return Response.json({tasks:[],results:[],competitors:[],stats:{managed:0,unassigned:0,overdue:0,won:0,lost:0,winRate:null}});
  return Response.json(emptyFeed);
 };
 const mounted=createRoot(document.getElementById('root'));
 const route=async hash=>{window.location.hash='#'+hash;await act(async()=>window.dispatchEvent(new window.Event('hashchange')));};
 try{
  await act(async()=>mounted.render(React.createElement(BidApp,{initialSession:session,signInUrl:'/login',signOutUrl:'/logout'})));
  for(const theme of ['female','male']){
   await route('dashboard');await act(async()=>document.querySelector(`[role="radio"][aria-label="${theme==='female'?'女性':'男性'}"]`).click());
   assert.equal(document.documentElement.dataset.navigatorTheme,theme);
   for(const view of ['welcome','useful-info','flow','dashboard','collected','bids','insights','support','links','keywords','assistant','signatures','collection-status','engineer','specs','settings']){
    await route(view);assert.equal(document.querySelector('main').dataset.view,view==='assistant'?'links':view);inspectDocument(theme+'/'+view);
   }
  }
  await route('assistant');assert.equal(window.location.hash,'#links');
  assert.equal(document.querySelector('main h1').textContent,'公告リンク・確認リスト');
  const menuLabels=[...document.querySelectorAll('[data-slot="sidebar-menu-button"]')].map(node=>node.textContent);
  assert.equal(menuLabels.filter(label=>label==='公告リンク・確認リスト').length,1);
  assert.ok(!menuLabels.includes('公式の公告リンク')&&!menuLabels.includes('サイト確認リスト'));
  const cards=()=>[...document.querySelectorAll('.assistant-card')];
  assert.equal(cards().length,6);
  assert.equal(new Set(cards().map(card=>card.querySelector('a').href)).size,6);
  for(const card of cards()){const link=card.querySelector('a');assert.equal(link.target,'_blank');assert.match(link.rel,/noopener/);}
  const check=()=>cards()[0].querySelector('[aria-pressed]');
  await act(async()=>check().click());assert.equal(check().getAttribute('aria-pressed'),'true');
  assert.equal(cards()[0].querySelector('.assistant-status').textContent,'確認済み');
  await route('keywords');await route('links');assert.equal(check().getAttribute('aria-pressed'),'true');
  await act(async()=>check().click());assert.equal(check().getAttribute('aria-pressed'),'false');
  for(const article of [...portalArticles,...pinnedPortalArticles]){
   await route('useful-info/'+article.id);assert.equal(document.querySelector('#column-title')?.textContent,article.title);inspectDocument(article.id);
  }
  await route('useful-info/not-a-real-article');assert.match(document.querySelector('.column-missing').textContent,/見つかりません/);
 }finally{await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;}
});

test('member login stands alone, preserves public guidance and restores the workspace after authentication',async()=>{
 const {default:BidApp}=await vite.ssrLoadModule('/app/bid-app.tsx');
 const originalFetch=globalThis.fetch;
 const guest={role:'guest',user:{id:'',email:'',name:''},members:[],membership:{allowed:false,kind:null}};
 let currentSession=guest;const requested=[];
 globalThis.fetch=async(path)=>{
  requested.push(path);
  if(path==='/api/workspace')return Response.json(currentSession);
  if(path==='/api/procurement-workbench')return Response.json({profile:emptyCompanyProfile,searches:[]});
  assert.equal(currentSession.membership.allowed,true,'login must not load protected data');
  return Response.json(emptyFeed);
 };
 window.location.hash='#dashboard';const mounted=createRoot(document.getElementById('root'));
 const route=async view=>{window.location.hash='#'+view;await act(async()=>window.dispatchEvent(new window.Event('hashchange')));};
 const inspectLogin=()=>{
  assert.equal(document.querySelector('main').dataset.view,'login');
  assert.equal(document.querySelectorAll('h1').length,1);assert.equal(document.querySelector('h1').textContent,'会員ログイン');
  assert.equal(document.querySelector('.app-sidebar, .app-topbar, .page-heading, .portal-navigator, .portal-sidebar-toggle'),null);
  assert.ok(document.querySelector('input[name="username"]'));assert.ok(document.querySelector('input[name="password"][type="password"]'));
  assert.equal(document.querySelector('.membership-login-footer a').getAttribute('href'),'/login');
 };
 try{
  await act(async()=>mounted.render(React.createElement(BidApp,{initialSession:guest,signInUrl:'/login',signOutUrl:'/logout'})));
  for(const view of ['dashboard','collected','links','keywords','collection-status']){await route(view);inspectLogin();}
  assert.deepEqual(requested,['/api/workspace']);
  await act(async()=>document.querySelector('.membership-login-footer button').click());
  assert.equal(document.querySelector('main').dataset.view,'welcome');assert.ok(document.querySelector('.app-sidebar'));assert.ok(document.querySelector('.app-topbar'));
  await route('collected');inspectLogin();
  currentSession=session;await act(async()=>window.dispatchEvent(new window.Event('focus')));
  assert.equal(document.querySelector('.membership-login-screen'),null);assert.ok(document.querySelector('.app-sidebar'));assert.ok(document.querySelector('.app-topbar'));assert.ok(document.querySelector('.discovery-workspace'));
  currentSession=guest;await act(async()=>window.dispatchEvent(new window.Event('focus')));inspectLogin();
 }finally{await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;}
});

test('open-counter cards show twelve summaries and details retain review feedback and pagination',async()=>{
 const {default:Feature}=await vite.ssrLoadModule('/app/open-counter-feature.tsx');
 const originalFetch=globalThis.fetch;let rejectReview=true,reviewed=false;const offsets=[];
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/procurement-workbench')return Response.json({profile:emptyCompanyProfile,searches:[]});
  if(options.method==='POST'){assert.equal(JSON.parse(options.body).action,'review');if(rejectReview)return Response.json({error:'保存を再試行してください。'},{status:503});reviewed=true;return Response.json({});}
  const offset=Number(new URL(path,'https://example.test').searchParams.get('offset'));offsets.push(offset);
  const rows=Array.from({length:25},(_,i)=>({...candidate,id:'item-'+i,title:'研修業務 '+i,review:reviewed&&i===0?'reviewed':'new'}));
  return Response.json({...emptyFeed,items:rows.slice(offset,offset+12),total:25});
 };
 const mounted=createRoot(document.getElementById('root'));
 try{
  await act(async()=>mounted.render(React.createElement(Feature,{mode:'sfl',onMode(){},onSearch(){}})));
  assert.equal(document.querySelectorAll('.opportunity-card').length,12);
  assert.deepEqual([...document.querySelector('.opportunity-card').querySelectorAll('dt')].map(x=>x.textContent),['種別','案件名','募集機関名']);
  await act(async()=>document.querySelector('.opportunity-card button').click());
  const dialog=()=>document.querySelector('[role="dialog"]');assert.ok(dialog());
  assert.ok(dialog().querySelector('.candidate-official-link'));assert.ok(dialog().querySelector('.opportunity-actions'));
  await act(async()=>dialog().querySelector('.discovery-review').click());
  assert.match(dialog().querySelector('[role="alert"]').textContent,/保存を再試行/);
  rejectReview=false;await act(async()=>dialog().querySelector('.discovery-review').click());
  assert.equal(dialog().querySelector('[role="alert"]'),null);assert.match(dialog().querySelector('.discovery-review').textContent,/未確認に戻す/);
  await act(async()=>dialog().querySelector('.candidate-close').click());assert.equal(dialog(),null);
  const buttons=()=>document.querySelectorAll('.oc-feature-pagination button');
  await act(async()=>buttons()[1].click());assert.equal(offsets.at(-1),12);assert.equal(document.querySelectorAll('.opportunity-card').length,12);
  await act(async()=>buttons()[1].click());assert.equal(offsets.at(-1),24);assert.equal(document.querySelectorAll('.opportunity-card').length,1);assert.ok(buttons()[1].disabled);
 }finally{await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;}
});

test('search details report failed saves inside the dialog and the external-only source has a direct search action',async()=>{
 const {DiscoveryWorkspace}=await vite.ssrLoadModule('/app/discovery-workspace.tsx');
 const originalFetch=globalThis.fetch;let posts=0;
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/procurement-workbench')return Response.json({profile:emptyCompanyProfile,searches:[]});
  if(options.method==='POST'){posts++;return Response.json({error:'確認状況を保存できませんでした。'},{status:503});}
  return Response.json({...emptyFeed,items:[candidate],total:1});
 };
 const mounted=createRoot(document.getElementById('root'));
 try{
  await act(async()=>mounted.render(React.createElement(DiscoveryWorkspace,{mode:'sfl'})));
  await act(async()=>document.querySelector('.opportunity-card button').click());
  await act(async()=>document.querySelector('[role="dialog"] .discovery-review').click());
  assert.match(document.querySelector('[role="dialog"] [role="alert"]').textContent,/確認状況を保存できません/);
  await act(async()=>document.querySelector('.candidate-close').click());
  await act(async()=>[...document.querySelectorAll('.discovery-source-grid button')].find(b=>b.querySelector('strong').textContent==='調達ポータル').click());
  const link=document.querySelector('.discovery-start-row a');assert.equal(link.textContent,'公式サイトで検索');assert.ok(link.href.startsWith('https://'));
  await act(async()=>document.querySelector('.discovery-search-flow').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(posts,1,'an external-only source never starts collection');
 }finally{await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;}
});

test('anonymous navigation gates every case surface while public guides remain usable without data requests',async()=>{
 const {default:BidApp}=await vite.ssrLoadModule('/app/bid-app.tsx');
 const anonymous={role:'guest',user:{id:'guest:fixture',name:'ゲスト',email:''},members:[],membership:{allowed:false,kind:null}};
 const originalFetch=globalThis.fetch,calls=[];
 globalThis.fetch=async path=>{calls.push(path);assert.equal(path,'/api/workspace');return Response.json(anonymous);};
 window.location.hash='#collected';const mounted=createRoot(document.getElementById('root'));
 try{
  await act(async()=>mounted.render(React.createElement(BidApp,{initialSession:anonymous,signInUrl:'/signin-with-chatgpt?return_to=/',signOutUrl:'/logout'})));
  for(const route of ['dashboard','collected','links','keywords','bids','insights','collection-status']){
   window.location.hash='#'+route;await act(async()=>window.dispatchEvent(new window.Event('hashchange')));
   assert.ok(document.querySelector('.membership-login'),route);
   assert.equal(document.querySelector('.membership-login input[name="username"]').getAttribute('autoComplete')??document.querySelector('.membership-login input[name="username"]').getAttribute('autocomplete'),'username');
   assert.equal(document.querySelector('.membership-login input[name="password"]').getAttribute('type'),'password');
   assert.equal(document.querySelectorAll('.opportunity-card,.assistant-card,.bid-editor').length,0);
   inspectDocument('locked/'+route);
  }
  window.location.hash='#flow';await act(async()=>window.dispatchEvent(new window.Event('hashchange')));
  assert.equal(document.querySelector('.membership-login'),null);assert.match(document.querySelector('main h1').textContent,/入札の手順/);
  window.location.hash='#settings';await act(async()=>window.dispatchEvent(new window.Event('hashchange')));
  assert.ok(document.querySelector('.membership-settings'));assert.equal(document.querySelector('.membership-create'),null);
  assert.ok(calls.length>0);
 }finally{await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;}
});

test('an expired API session removes result content and returns to the member login form',async()=>{
 const {default:BidApp}=await vite.ssrLoadModule('/app/bid-app.tsx');
 const originalFetch=globalThis.fetch;let expired=false;
 globalThis.fetch=async path=>{
  if(path==='/api/workspace')return Response.json(session);
  if(path.startsWith('/api/open-counter'))return expired?Response.json({code:'member_login_required',error:'会員ログインしてください。'},{status:401}):Response.json({...emptyFeed,items:[],total:0});
  if(path==='/api/procurement-workbench')return Response.json({profile:emptyCompanyProfile,searches:[]});
  return Response.json(emptyFeed);
 };
 window.location.hash='#dashboard';const mounted=createRoot(document.getElementById('root'));
 try{
  await act(async()=>mounted.render(React.createElement(BidApp,{initialSession:session,signInUrl:'/login',signOutUrl:'/logout'})));
  assert.equal(document.querySelector('.membership-login'),null);
  const refresh=[...document.querySelectorAll('main button')].find(button=>button.textContent.includes('一覧を更新'));assert.ok(refresh);
  expired=true;await act(async()=>refresh.click());
  assert.ok(document.querySelector('.membership-login'));assert.equal(document.querySelector('.oc-feature'),null);
 }finally{await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;}
});

test('owner settings expose an accessible account form and explain owner-only credential access',async()=>{
 const {MembershipSettings}=await vite.ssrLoadModule('/app/portal-membership.tsx');
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async path=>{assert.equal(path,'/api/member-accounts');return Response.json({accounts:[]});};
 const mounted=createRoot(document.getElementById('root'));
 try{
  await act(async()=>mounted.render(React.createElement(MembershipSettings,{session:{...session,role:'owner',membership:{allowed:true,kind:'owner'}},signInUrl:'/login'})));
  assert.ok(document.querySelector('.membership-create').hasAttribute('open'));
  assert.equal([...document.querySelectorAll('input[type="password"]')].filter(input=>(input.getAttribute('minLength')??input.getAttribute('minlength'))==='12').length,2);
  const idField=document.querySelector('input[name="username"]');assert.ok(idField.hasAttribute('required'));assert.equal(idField.getAttribute('maxLength')??idField.getAttribute('maxlength'),'64');
  assert.ok(new RegExp(idField.getAttribute('pattern'),'v').test('member-name_01'));
  const password=document.querySelector('input[name="new-password"]');assert.ok(document.querySelector(`label[for="${password.id}"]`));assert.ok(document.getElementById(password.getAttribute('aria-describedby')));
  assert.match(document.querySelector('.membership-settings').textContent,/管理者だけが確認できます/);
 }finally{await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;}
});


test('free mode has a fourth tab, an empty input, no preset generation and locked qualification controls',async()=>{
 const {default:BidApp}=await vite.ssrLoadModule('/app/bid-app.tsx');
 const originalFetch=globalThis.fetch;
 const queries=[];
 globalThis.fetch=async(path,options={})=>{
  assert.ok(!options.method||options.method==='GET');
  if(path==='/api/workspace')return Response.json(session);
  if(path==='/api/procurement-workbench')return Response.json({profile:emptyCompanyProfile,searches:[]});
  if(path.startsWith('/api/discovery?'))queries.push(new URL(path,'https://portal.example.test').searchParams);
  return Response.json(emptyFeed);
 };
 window.location.hash='#collected';const mounted=createRoot(document.getElementById('root'));
 try{
  await act(async()=>mounted.render(React.createElement(BidApp,{initialSession:session,signInUrl:'/login',signOutUrl:'/logout'})));
  const tabs=[...document.querySelectorAll('.collection-mode-tabs [role="tab"]')];
  assert.equal(tabs.length,4);const free=tabs.find(tab=>tab.getAttribute('data-mode')==='free');assert.match(free.textContent,/フリーモード/);
  await act(async()=>{const e=new window.Event('mousedown',{bubbles:true});e.button=0;e.ctrlKey=false;free.dispatchEvent(e);});
  assert.equal(free.getAttribute('aria-selected'),'true');
  const workspace=document.querySelector('.discovery-workspace');assert.equal(workspace.dataset.mode,'free');
  assert.ok(workspace.querySelector('.discovery-search').hasAttribute('open'));
  assert.equal(workspace.querySelector('#collection-keywords-free').value,'');assert.ok(workspace.querySelector('#collection-keywords-free').hasAttribute('required'));
  assert.equal(workspace.querySelector('[data-tour="collect"]').disabled,true);
  assert.equal(workspace.querySelector('[data-tour="saved-search"]').disabled,true);
  const qualification=workspace.querySelector('.qualification-locked');assert.ok(qualification);
  assert.match(qualification.textContent,/変更不可/);assert.match(qualification.textContent,/全4モードで共通/);
  assert.equal(qualification.querySelector('input,select'),null);
  assert.deepEqual([...qualification.querySelectorAll('.qualification-fixed-grid dd')].slice(0,3).map(el=>el.textContent),['等級 D','等級 D','等級 C']);
  assert.doesNotMatch(workspace.textContent,/キーワードを自動生成/);
  assert.equal(workspace.querySelector('[role="switch"]').getAttribute('aria-checked'),'false');
  assert.equal(queries.at(-1).get('bucket'),'all');assert.equal(queries.at(-1).get('keywords'),'');assert.equal(queries.at(-1).get('mode'),'free');
  assert.equal(globalThis.reviewLarkMode,'free');
 }finally{await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;}
});

test('free search submits exact input, opens results and selects an existing Lark destination in details',async()=>{
 const {DiscoveryWorkspace}=await vite.ssrLoadModule('/app/discovery-workspace.tsx');
 const originalFetch=globalThis.fetch,posts=[],queries=[];
 const item={...candidate,title:'医療機器の購入',summary:'医療機器を購入。',descriptionText:'全省庁統一資格の物品の販売 D等級。',classification:{unifiedEligibleEvidence:'全省庁統一資格の物品の販売 D等級。'}};
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/procurement-workbench')return Response.json({profile:emptyCompanyProfile,searches:[]});
  if(options.method==='POST'){posts.push(JSON.parse(options.body));return Response.json({progress:{...progress,status:'completed'}});}
  queries.push(new URL(path,'https://portal.example.test').searchParams);
  return Response.json({...emptyFeed,items:[item],total:1,counts:{all:1,recommended:1,related:0,attention:0,reviewed:0},progress:{...progress,status:'completed'}});
 };
 const mounted=createRoot(document.getElementById('root'));
 try{
  await act(async()=>mounted.render(React.createElement(DiscoveryWorkspace,{mode:'free',initialKeyword:'医療機器'})));
  assert.equal(document.querySelector('[data-tour="collect"]').disabled,false);
  await act(async()=>document.querySelector('.discovery-search form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.deepEqual(posts.filter(v=>v.action==='start').map(({batch,...value})=>value),[{action:'start',mode:'free',keywords:'医療機器',synonyms:'off',source:'all'}]);
  assert.ok(document.querySelector('.discovery-results').hasAttribute('open'));
  assert.equal(queries.at(-1).get('mode'),'free');assert.equal(queries.at(-1).get('keywords'),'医療機器');
  await act(async()=>document.querySelector('.opportunity-card button').click());
  assert.match(document.querySelector('.candidate-sheet').textContent,/物品の販売：登録等級D/);
  assert.doesNotMatch(document.querySelector('.candidate-sheet').textContent,/照合は行いません/);
  const destination=document.querySelector('.free-lark-destination select');assert.ok(destination);assert.equal(destination.querySelectorAll('option').length,4);
  Object.defineProperty(destination,'value',{configurable:true,value:'engineer'});
  await act(async()=>destination.dispatchEvent(new window.Event('change',{bubbles:true})));
  assert.equal(globalThis.reviewLarkMode,'engineer');assert.equal(queries.at(-1).get('larkMode'),'engineer');assert.equal(queries.at(-1).get('mode'),'free');
 }finally{await act(async()=>mounted.unmount());globalThis.fetch=originalFetch;delete globalThis.reviewLarkMode;}
});
