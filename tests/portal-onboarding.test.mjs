import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { createServer } from 'vite';
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({configFile:false,appType:'custom',root,resolve:{alias:{'@':root}},server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const {readOnboardingProgress,onboardingStorageKey,onboardingSteps}=await vite.ssrLoadModule('/lib/portal-onboarding.ts');
const {usePortalOnboarding}=await vite.ssrLoadModule('/app/portal-onboarding.tsx');
test('invalid or outdated saved progress safely restarts the guide',()=>{
 for(const raw of [null,'broken','{}','{"step":-1}','{"step":999}','{"step":1.5}'])assert.equal(readOnboardingProgress(raw).step,0);
 assert.deepEqual(readOnboardingProgress('{"seen":true,"step":4,"completed":false}'),{seen:true,step:4,completed:false});
});
test('first visit, pause, reload, back and completion preserve the guide without executing portal actions',async()=>{
 const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
 const saved=new Map();
 Object.assign(globalThis,{window,document,IS_REACT_ACT_ENVIRONMENT:true,localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)}});
 window.location={hash:''};
 let guide;const views=[];const navigate=view=>{views.push(view);window.location.hash='#'+view;};
 function Harness(){guide=usePortalOnboarding(navigate);return null;}
 let mounted=createRoot(document.getElementById('root'));
 await act(async()=>mounted.render(React.createElement(Harness)));
 assert.deepEqual(views,['welcome']);assert.equal(guide.active,false);
 await act(async()=>guide.start(3));assert.equal(guide.active,true);assert.equal(guide.step,3);assert.equal(views.at(-1),'collected');
 await act(async()=>guide.next());assert.equal(guide.step,4);
 await act(async()=>guide.pause());assert.equal(guide.active,false);
 await act(async()=>mounted.unmount());
 mounted=createRoot(document.getElementById('root'));
 await act(async()=>mounted.render(React.createElement(Harness)));
 assert.equal(guide.step,4);assert.equal(guide.active,false);
 await act(async()=>guide.start());assert.equal(guide.step,4);
 await act(async()=>guide.back());assert.equal(guide.step,3);
 await act(async()=>guide.start(onboardingSteps.length-1));assert.equal(views.at(-1),'bids');
 await act(async()=>guide.next());assert.equal(guide.completed,true);assert.equal(guide.active,false);assert.equal(views.at(-1),'welcome');
 assert.equal(readOnboardingProgress(saved.get(onboardingStorageKey)).completed,true);
 await act(async()=>mounted.unmount());
 delete globalThis.window;delete globalThis.document;delete globalThis.localStorage;
});

test('tour reveals nested search sections without opening an inactive tab',async()=>{
 const {PortalTour}=await vite.ssrLoadModule('/app/portal-onboarding.tsx');
 const {window,document}=parseHTML('<html><body><main id="workspace-main"><div hidden><details id="inactive-search"><details data-tour="sources"></details></details></div><details id="active-search"><details id="active-sources" data-tour="sources"><button>検索先</button></details></details></main><div id="tour-root"></div></body></html>');
 const originalObserver=globalThis.MutationObserver;
 Object.assign(globalThis,{window,document,MutationObserver:window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true});
 window.HTMLElement.prototype.getClientRects=function(){for(let el=this;el;el=el.parentElement){if(el.hasAttribute('hidden'))return [];if(el!==this&&el.tagName==='DETAILS'&&!el.hasAttribute('open'))return [];}return [{}];};
 window.HTMLElement.prototype.scrollIntoView=function(){};window.scrollBy=()=>{};
 const mounted=createRoot(document.getElementById('tour-root'));
 try{
  const step=onboardingSteps.findIndex(item=>item.selector==='[data-tour="sources"]');
  await act(async()=>mounted.render(React.createElement(PortalTour,{step,view:'collected',onNext:()=>{},onBack:()=>{},onPause:()=>{},onReturn:()=>{}})));
  assert.equal(document.getElementById('active-search').hasAttribute('open'),true);
  assert.equal(document.getElementById('active-sources').hasAttribute('open'),true);
  assert.equal(document.getElementById('inactive-search').hasAttribute('open'),false);
  assert.ok(document.getElementById('active-sources').classList.contains('onboarding-highlight'));
 }finally{await act(async()=>mounted.unmount());globalThis.MutationObserver=originalObserver;delete globalThis.window;delete globalThis.document;}
});
