import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('..',import.meta.url)),sql=new DatabaseSync(':memory:');
let queryTrace=null,readBytes=null;
for(const file of readdirSync(root+'/drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(root+'/drizzle/'+file,'utf8'));
const d1={async batch(statements){return Promise.all(statements.map(s=>s.run()))},prepare(query){queryTrace?.push(query);const stmt=sql.prepare(query);const bound=(args=[])=>({bind(...values){return bound(values)},async first(){return stmt.get(...args)??null},async run(){return {success:true,meta:stmt.run(...args)}},async all(){const results=stmt.all(...args);if(readBytes!==null)readBytes+=Buffer.byteLength(JSON.stringify(results));return {results}}});return bound()}};
globalThis.discoveryTestEnv={DB:d1,PORTAL_CREDENTIAL_ENCRYPTION_KEY:'b2'.repeat(32),BID_OWNER_EMAIL:'owner@example.test'};
const vite=await createServer({configFile:false,appType:'custom',root,resolve:{alias:[{find:'cloudflare:workers',replacement:'\0discovery-env'},{find:'@',replacement:root}]},plugins:[{name:'discovery-test-env',resolveId(id){if(id==='\0discovery-env')return id},load(id){if(id==='\0discovery-env')return 'export const env=globalThis.discoveryTestEnv;'}}],server:{middlewareMode:true,hmr:false}});
const domain=await vite.ssrLoadModule('/lib/discovery-domain.ts'),store=await vite.ssrLoadModule('/lib/discovery-store.ts'),collector=await vite.ssrLoadModule('/lib/discovery-collector.ts'),route=await vite.ssrLoadModule('/app/api/discovery/route.ts'),parser=await vite.ssrLoadModule('/lib/defense-browser-parser.ts'),transport=await vite.ssrLoadModule('/lib/discovery-fetch.ts');
const workbench=await vite.ssrLoadModule('/lib/procurement-workbench.ts'),preferences=await vite.ssrLoadModule('/app/api/procurement-workbench/route.ts'),bidsStore=await vite.ssrLoadModule('/lib/server-store.ts'),bidDomain=await vite.ssrLoadModule('/lib/bid-domain.ts'),insights=await vite.ssrLoadModule('/app/api/bid-insights/route.ts');
const originalFetch=globalThis.fetch;
after(async()=>{globalThis.fetch=originalFetch;await vite.close();sql.close();delete globalThis.discoveryTestEnv});
const memberAuth=await vite.ssrLoadModule('/lib/member-auth.ts');
await memberAuth.createAccount({loginId:'search-member',name:'検索会員',password:'local-test-search-password'});
const memberToken=await memberAuth.loginMember(new Request('https://portal.example.test'),{loginId:'search-member',password:'local-test-search-password'});
const memberHeaders={cookie:'__Host-bid-member='+memberToken};
const accountActor=await memberAuth.requireSearchMember(new Request('https://portal.example.test',{headers:memberHeaders}));
const actor={id:'owner',email:'owner@example.test',name:'Owner',role:'owner'},member={id:'member',email:'member@example.test',name:'Member',role:'member'};
const candidate=(title='Webサイト制作',url='https://www.mod.go.jp/msdf/bukei/notice.pdf',extra={})=>({id:url,title,agency:'防衛省 海上自衛隊',deadline:'2099-09-30',deadlineEvidence:'見積書提出期限2099年9月30日',officialUrl:url,source:'海上自衛隊',sourceUrl:'https://www.kkj.go.jp/s/',matchedKeywords:['Webサイト'],summary:'Webサイト制作の調達。',descriptionText:'Webサイト制作の調達。',contractMethod:'オープンカウンター',...extra});
const options=(extra={})=>({mode:'engineer',source:'all',bucket:'recommended',category:'all',keywords:[],offset:0,newOnly:false,exclude:[],...extra});
const reset=()=>{sql.exec('DELETE FROM discovery_candidates; DELETE FROM discovery_revisions; DELETE FROM discovery_reviews; DELETE FROM discovery_runtime; DELETE FROM discovery_cache; DELETE FROM lark_bid_registrations;')};
const req=(body,authenticated=true)=>new Request('https://portal.example.test/api/discovery',{method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{'oai-authenticated-user-id':actor.id,'oai-authenticated-user-email':actor.email}:{})},body:JSON.stringify(body)});

test('search snapshot groups the whole eligible pool, and exact details stay authenticated and scoped',async()=>{
 reset();
 const items=Array.from({length:32},(_,i)=>candidate(`Webサイト制作 ${i}`,`https://example.go.jp/snapshot/${i}`,{contractMethod:i<14?'':'オープンカウンター',descriptionText:(i<14?'全省庁統一資格「役務の提供等」のD等級を有する者。':'オープンカウンター方式。')+'仕様書の本文。'.repeat(500)}));
 items[0].contractMethod='オープンカウンター';
 await store.saveDiscovered([...items,candidate('Webサイト制作 対象外','https://example.go.jp/snapshot/excluded',{contractMethod:'',descriptionText:'全省庁統一資格「役務の提供等」のA等級を有する者に限る。'})]);
 let networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw Error('snapshot operations must not access official sites');};
 const query={mode:'engineer',keywords:'Webサイト',bucket:'all',category:'all',includePool:'1',synonyms:'off'};
 const get=(extra={},authenticated=true)=>route.GET(new Request('https://portal.example.test/api/discovery?'+new URLSearchParams({...query,...extra}),{headers:authenticated?memberHeaders:{}}));
 try{
  const response=await get();assert.equal(response.status,200);const feed=await response.json();
  assert.equal(feed.pool.length,32);assert.equal(feed.items.length,12);assert.equal(feed.total,32);
  assert.ok(feed.items.every(item=>item.descriptionText.length>1000));
  assert.ok(feed.pool.every(item=>item.previewOnly&&!item.descriptionText&&!item.summary&&!('_eligible' in item)));
  const open=domain.groupDiscoveryFeed(feed,'open-counter','all',0),unified=domain.groupDiscoveryFeed(feed,'unified-required','all',0);
  assert.equal(open.total,19);assert.equal(unified.total,14);assert.equal(open.items.length,12);
  assert.equal(domain.groupDiscoveryFeed(feed,'open-counter','all',12).items.length,7);
  assert.deepEqual(domain.groupDiscoveryFeed(feed,'all','all',0).items.map(item=>item.id),feed.items.map(item=>item.id));
  const both=await domain.discoveryIdentity(items[0]);
  assert.ok(feed.pool.find(item=>item.id===both).classification.openCounterEvidence);
  assert.ok(feed.pool.find(item=>item.id===both).classification.unifiedEligibleEvidence);
  assert.deepEqual(domain.groupDiscoveryFeed(feed,'all','all',999).items.map(item=>item.id),feed.pool.slice(24).map(item=>item.id),'out-of-range pages clamp to the last available page');
  const id=feed.pool.at(-1).id;
  await store.setDiscoveryReview(accountActor,'engineer',id,'reviewed','');
  queryTrace=[];
  const detail=await (await get({includePool:'0',itemId:id})).json();
  assert.equal(detail.items.length,1);assert.equal(detail.items[0].id,id);assert.ok(detail.items[0].descriptionText.length>1000);assert.equal(detail.items[0].review,'reviewed');assert.equal(detail.pool,undefined);
  assert.ok(queryTrace.some(query=>query.includes('id IN (SELECT value FROM json_each(?))')),'full details use a bounded identity lookup');queryTrace=null;
  const other=await store.discoveryFeed(member,options({bucket:'all',keywords:['Webサイト'],candidateIds:[id]}));assert.equal(other.items[0].review,'new','member review state stays private');
  const excludedId=await domain.discoveryIdentity(candidate('Webサイト制作 対象外','https://example.go.jp/snapshot/excluded'));
  assert.equal((await (await get({itemId:excludedId})).json()).items.length,0,'an identity lookup cannot bypass qualification rules');
  assert.equal((await get({itemId:id},false)).status,401);
  assert.equal((await get({itemId:'bad-id'})).status,400);
  assert.equal((await get({itemId:id,runId:'11111111-1111-4111-8111-111111111111'})).status,400);
  assert.equal((await (await get({includePool:'0'})).json()).pool,undefined);
  assert.deepEqual((await (await get({mode:'free',keywords:''})).json()).pool,[]);
  assert.equal(networkCalls,0);
 }finally{globalThis.fetch=originalFetch;queryTrace=null;}
});

test('issuer-only keywords do not return food procurement, while real work and agency filters still match',async()=>{
 reset();const agency='システム通信・サイバー学校';
 await store.saveDiscovered([
  candidate('唐揚げ弁当の購入','https://www.mod.go.jp/gsdf/food.pdf',{agency,descriptionText:'システム 通信・サイバー学校。食品を納入する。'}),
  candidate('端末保守','https://www.mod.go.jp/gsdf/work.pdf',{agency,descriptionText:'システム通信・サイバー学校。予約システムの保守を行う。'}),
 ]);
 const found=await store.discoveryFeed(actor,options({bucket:'all',keywords:['システム']}));
 assert.deepEqual(found.items.map(i=>i.title),['端末保守']);assert.equal(found.items[0].matchLocation,'body');
 assert.equal((await store.discoveryFeed(actor,options({bucket:'all',keywords:['システム'],filters:workbench.advancedSearchSchema.parse({scope:'title'})}))).total,0);
 const agencySearch=await store.discoveryFeed(actor,options({bucket:'all',keywords:['購入'],filters:workbench.advancedSearchSchema.parse({agency:'システム通信'})}));
 assert.equal(agencySearch.total,1);assert.equal(agencySearch.items[0].title,'唐揚げ弁当の購入');
});

test('procurement guides are not job results, including previously saved guides',async()=>{
 reset();const guide=candidate('オープンカウンターとは','https://www.mod.go.jp/gsdf/chosp/fin/ocyouryou1.pdf');
 assert.equal(parser.procurementLinkPriority(guide.title,guide.officialUrl),99);
 assert.equal(parser.procurementLinkPriority('オープンカウンター案内パンフレット印刷','https://www.mod.go.jp/gsdf/print.pdf'),2);
 await store.saveDiscovered([guide,candidate('オープンカウンター案内パンフレット印刷','https://www.mod.go.jp/gsdf/print.pdf')]);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,1);
 const legacy={...guide,searchable:'オープンカウンターとは',fingerprint:'legacy'};
 sql.prepare('INSERT INTO discovery_candidates(id,data,first_seen,last_seen,changed_at,fingerprint,deadline) VALUES(?,?,?,?,?,?,?)').run('legacy',JSON.stringify(legacy),Date.now(),Date.now(),Date.now(),'legacy',guide.deadline);
 assert.deepEqual((await store.discoveryFeed(actor,options({bucket:'all',keywords:['オープンカウンター']}))).items.map(v=>v.title),['オープンカウンター案内パンフレット印刷']);
});

test('all 30,240 discrete search combinations return the expected records, counts and ordering',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-16T03:00:00Z')});reset();
 const cases=[],now=Date.now();let index=0;
 const variants=[
  {name:'title',bothTitle:true,deadline:'2026-09-20',category:'unified',bucket:'recommended'},
  {name:'body',bothTitle:false,deadline:'2026-09-25',category:'open',bucket:'recommended'},
  {name:'bodyOnly',noTitle:true,deadline:'2026-09-22',category:'unified',bucket:'related'},
  {name:'oneTerm',onlyOne:true,deadline:'2026-09-19',category:'open',bucket:'recommended'},
  {name:'unknown',bothTitle:true,deadline:'',category:'open',bucket:'attention'},
  {name:'closed',bothTitle:true,deadline:'2026-09-15',category:'unified',bucket:'closed'},
  {name:'today',bothTitle:true,deadline:'2026-09-16',category:'open',bucket:'closed'},
  {name:'reviewed',bothTitle:true,deadline:'2026-10-01',category:'unified',bucket:'reviewed'},
  {name:'old',bothTitle:true,deadline:'2026-09-21',category:'open',bucket:'recommended',old:true},
  {name:'local',bothTitle:true,deadline:'2026-09-20',category:'excluded',bucket:'recommended'},
 ];
 for(const mode of ['sfl','engineer','academy'])for(const origin of ['gsdf','msdf','asdf','national'])for(const v of variants){
  const a=mode+'甲',b=mode+'乙',title=(v.noTitle?'業務':v.bothTitle?a+' '+b:a)+' '+v.name;
  const descriptionText=(v.noTitle?a+' '+b:(!v.bothTitle&&!v.onlyOne?b:'') )+' '+(v.category==='unified'?'全省庁統一資格を有する者。':v.category==='excluded'?'本県の入札参加資格者名簿に登録されている者。':'調達方式：オープンカウンター方式。');
  const item=candidate(title,origin==='national'?`https://example.go.jp/audit/${index}`:`https://www.mod.go.jp/${origin}/audit/${index}`,{agency:origin==='national'?'国の機関':'防衛省 '+origin,descriptionText,deadline:v.deadline,contractMethod:'',prefecture:index%2?'滋賀県':'東京都',indexedDate:'2026-09-10'});
  await store.saveDiscovered([item]);const id=await domain.discoveryIdentity(item),firstSeen=now-(v.old?9*86400000:index*1000),changedAt=now-index*2000;
  sql.prepare('UPDATE discovery_candidates SET first_seen=?,changed_at=? WHERE id=?').run(firstSeen,changedAt,id);
  if(v.bucket==='reviewed')await store.setDiscoveryReview(actor,mode,id,'reviewed','');
  cases.push({...v,mode,origin,id,firstSeen,changedAt,score:v.bothTitle?40:v.noTitle?6:v.onlyOne?20:23});index++;
 }
 let checked=0;
 for(const mode of ['sfl','engineer','academy'])for(const source of ['all','kkj','p-portal','mod','gsdf','msdf','asdf'])for(const scope of ['fulltext','title'])for(const match of ['any','all'])for(const period of ['future','all','closed'])for(const category of ['all','open-counter','unified-required'])for(const newOnly of [false,true]){
  const base=cases.filter(v=>v.mode===mode&&!['p-portal'].includes(source)&&(!['mod','gsdf','msdf','asdf'].includes(source)||(source==='mod'?v.origin!=='national':v.origin===source))&&v.category!=='excluded'&&(!newOnly||!v.old)&& (period==='all'||(period==='closed'?v.bucket==='closed':v.bucket!=='closed'))&&(category==='all'||v.category===(category==='open-counter'?'open':'unified'))&&(scope!=='title'||!v.noTitle)&& (match!=='all'||(scope==='title'?v.bothTitle:!v.onlyOne)));
  const expectedCounts={all:base.length,recommended:0,related:0,attention:0,reviewed:0};for(const v of base)if(v.bucket!=='closed')expectedCounts[v.bucket]++;
  for(const bucket of ['all','recommended','related','attention','reviewed'])for(const sort of ['recommended','deadline','newest','updated']){
   const rank=v=>scope==='title'?(v.bothTitle?40:20):v.score;
   const wanted=base.filter(v=>bucket==='all'||v.bucket===bucket).sort((a,b)=>sort==='deadline'?(a.deadline||'9999').localeCompare(b.deadline||'9999')||a.id.localeCompare(b.id):sort==='newest'?b.firstSeen-a.firstSeen||a.id.localeCompare(b.id):sort==='updated'?b.changedAt-a.changedAt||a.id.localeCompare(b.id):rank(b)-rank(a)||(a.deadline||'9999').localeCompare(b.deadline||'9999')||b.firstSeen-a.firstSeen||a.id.localeCompare(b.id));
   const q=options({mode,source,category,bucket,newOnly,keywords:[mode+'甲',mode+'乙'],filters:workbench.advancedSearchSchema.parse({scope,match,period,sort})});
   const got=await store.discoveryFeed(actor,q),label=JSON.stringify({mode,source,scope,match,period,category,newOnly,bucket,sort});
   assert.deepEqual(got.counts,expectedCounts,label);assert.equal(got.total,wanted.length,label);assert.deepEqual(got.items.map(v=>v.id),wanted.slice(0,20).map(v=>v.id),label);checked++;
  }
 }
 assert.equal(checked,30240);
});

test('DX saved search returns immediately while shared collection is running and separates unknown deadlines',async()=>{
 reset();
 await store.saveDiscovered([
  candidate('DX研修業務','https://example.go.jp/dx-current'),
  candidate('DX推進支援','https://example.go.jp/dx-unknown',{deadline:'',deadlineEvidence:''}),
  candidate('清掃業務','https://example.go.jp/cleaning'),
 ]);
 await collector.startCollection(['DX'],'manual','all','sfl');
 let networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw Error('saved results must not wait for official sites');};
 try{
  const search=async bucket=>{
   const response=await route.GET(new Request('https://portal.example.test/api/discovery?'+new URLSearchParams({mode:'sfl',keywords:'DX',bucket,synonyms:'off'}),{headers:memberHeaders}));
   assert.equal(response.status,200);return response.json();
  };
  const all=await search('all');
  assert.equal(all.progress.status,'saved');assert.equal(all.total,2);
  assert.equal(all.counts.recommended,1);assert.equal(all.counts.attention,1);
  assert.deepEqual((await search('recommended')).items.map(item=>item.title),['DX研修業務']);
  assert.deepEqual((await search('attention')).items.map(item=>item.title),['DX推進支援']);
  assert.equal(networkCalls,0);
 }finally{globalThis.fetch=originalFetch;}
});

test('search boundary inputs, dates, exclusions and literal wildcards are validated by the actual endpoint',async()=>{
 reset();await store.saveDiscovered([
  candidate('研修 100% 対象','https://example.go.jp/a',{prefecture:'滋賀県',indexedDate:'2026-09-10'}),
  candidate('研修 1000 対象','https://example.go.jp/b',{prefecture:'東京都',indexedDate:'2026-09-11'}),
 ]);
 const get=async params=>route.GET(new Request('https://portal.example.test/api/discovery?'+new URLSearchParams({mode:'sfl',bucket:'all',...params}),{headers:memberHeaders}));
 for(const params of [{mode:'bad'},{source:'bad'},{source:'njss'},{offset:'-1'},{offset:'1.5'},{offset:'20001'},{keywords:'a'.repeat(4001)},{newOnly:'yes'},{scope:'bad'},{deadlineFrom:'2026-02-30'},{deadlineFrom:'2026-09-20',deadlineTo:'2026-09-19'},{announcedFrom:'2026-09-20',announcedTo:'2026-09-19'}])assert.equal((await get(params)).status,400,JSON.stringify(params));
 assert.equal((await(await get({keywords:'100%'})).json()).total,1);
 assert.equal((await(await get({keywords:'研修',exclude:'100%'})).json()).total,1);
 assert.equal((await(await get({keywords:'研修',region:'滋賀',announcedFrom:'2026-09-10',announcedTo:'2026-09-10'})).json()).total,1);
 assert.equal((await(await get({keywords:'存在しない検証語'})).json()).total,0);
 assert.equal((await(await get({keywords:'研修',offset:'20000'})).json()).items.length,0);
 assert.deepEqual(domain.splitKeywords(' 研修、研修,広報，ＤＸ\n清掃 '),['研修','広報','ＤＸ','清掃']);
 assert.equal(domain.splitKeywords(Array.from({length:51},(_,i)=>'語'+i).join('、')).length,50);
});

test('discovery endpoints reject guests and enforce origin before touching collectors',async()=>{
 reset();let fetched=0;globalThis.fetch=async()=>{fetched++;throw Error('unexpected fetch')};
 assert.equal((await route.GET(new Request('https://portal.example.test/api/discovery'))).status,401);
 assert.equal((await route.POST(req({action:'start'},false))).status,401);
 const r=req({action:'start'});r.headers.set('origin','https://evil.example.test');assert.equal((await route.POST(r)).status,403);assert.equal(fetched,0);
 globalThis.fetch=originalFetch;
});
test('official MSDF table structure retains no-PDF poster and earlier deadline separately',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-12T03:00:00Z')});reset();
 // Recorded field structure of the MSDF purchasing page; this is a deterministic
 // fixture, not a claim that a live collection request was performed by this test.
 const html='<html><head><title>オープンカウンター調達</title></head><body><h1>令和8年9月11日現在</h1><table><tr><td>件名</td><td>同等品申請書提出期限</td><td>見積書提出期限</td><td>納期</td></tr><tr><td>開隊70周年記念演奏会用ポスター（A4）ほか</td><td>2026.9.11</td><td>2026.9.15</td><td>2026.10.16</td></tr></table></body></html>';
 const url='https://www.mod.go.jp/msdf/bukei/t2/nyusatsu_op_zentoukyuu2.htm';
 const notice=parser.parseOfficialHtml(html,url,'msdf').notices[0];
 assert.equal(notice.url,url);assert.equal(notice.deadline.date,'2026-09-15');assert.equal(notice.milestones[0].date,'2026-09-11');
 await store.saveDiscovered([candidate(notice.title,url,{deadline:notice.deadline.date,deadlineEvidence:notice.deadline.evidence,descriptionText:notice.text,milestones:notice.milestones})]);
 const feed=await store.discoveryFeed(actor,options({mode:'academy',bucket:'attention'}));assert.equal(feed.items.length,1);assert.equal(feed.items[0].deadline,'2026-09-15');
});
test('all 18 audience/source combinations retain source identity; the preparation source stays empty',async()=>{
 reset();const modes={sfl:'職員研修',engineer:'Webサイト制作',academy:'清掃'};
 for(const word of Object.values(modes))for(const branch of ['gsdf','msdf','asdf'])await store.saveDiscovered([candidate(word+' '+branch,`https://www.mod.go.jp/${branch}/${word}.pdf`,{agency:`防衛省 ${branch}`})]);
 for(const mode of Object.keys(modes))for(const source of ['kkj','p-portal','mod','gsdf','msdf','asdf']){
  const feed=await store.discoveryFeed(actor,options({mode,source}));
  const perBranch=mode==='sfl'?2:1; // SFL intentionally also includes Web work.
  assert.equal(feed.items.length,['p-portal'].includes(source)?0:['kkj','mod'].includes(source)?perBranch*3:perBranch,mode+'/'+source);
  assert.ok(feed.items.every(item=>item.title.startsWith(modes[mode])||(mode==='sfl'&&item.title.startsWith(modes.engineer))));
 }
});
test('unknown deadlines stay in attention, deadlines on JST today are excluded, reviews are personal and updates resurface',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-11T15:05:00Z')});reset();
 const item=candidate('Webサイト制作 締切不明',undefined,{deadline:'',deadlineEvidence:undefined});await store.saveDiscovered([item,candidate('Webサイト制作 当日','https://www.mod.go.jp/asdf/today.pdf',{deadline:'2026-09-12'})]);
 let feed=await store.discoveryFeed(actor,options({bucket:'attention'}));assert.equal(feed.items.length,1);const id=feed.items[0].id;
 await store.setDiscoveryReview(actor,'engineer',id,'reviewed','');assert.equal((await store.discoveryFeed(actor,options({bucket:'reviewed'}))).items.length,1);
 assert.equal((await store.discoveryFeed(member,options({bucket:'attention'}))).items.length,1);
 await store.saveDiscovered([{...item,deadline:'2099-09-30',deadlineEvidence:'見積書提出期限2099年9月30日'}]);
 feed=await store.discoveryFeed(actor,options({bucket:'attention'}));assert.equal(feed.items.length,1);assert.equal(feed.items[0].updatedSinceReview,true);
});
test('exact original links deduplicate across API and direct collection; different titles on a list stay distinct',async()=>{
 reset();const item=candidate();await store.saveDiscovered([item,{...item,sourceUrl:'https://www.mod.go.jp/msdf/bukei/index.html'},candidate('Webサイト制作 その2')]);
 const feed=await store.discoveryFeed(actor,options());assert.equal(feed.items.length,2);assert.equal(feed.items.find(v=>v.title===item.title).origins.length,2);
});
test('recommendations page beyond 20 and do not silently discard saved candidates',async()=>{
 reset();for(let i=0;i<45;i++)await store.saveDiscovered([candidate(`Webサイト制作 ${i}`,`https://www.mod.go.jp/msdf/${i}.pdf`)]);
 const first=await store.discoveryFeed(actor,options()),second=await store.discoveryFeed(actor,options({offset:20})),last=await store.discoveryFeed(actor,options({offset:40}));
 assert.equal(first.total,45);assert.equal(first.items.length,20);assert.equal(second.items.length,20);assert.equal(last.items.length,5);assert.equal(new Set([...first.items,...second.items,...last.items].map(v=>v.id)).size,45);
});
test('discovery API shows twelve results per page in every mode without losing later results',async()=>{
 reset();await store.saveDiscovered(Array.from({length:27},(_,i)=>candidate(`Webサイト制作 ${i}`,`https://www.mod.go.jp/msdf/page-${i}.pdf`)));
 const get=async(mode,offset=0,keywords='Webサイト制作')=>{
  const response=await route.GET(new Request('https://portal.example.test/api/discovery?'+new URLSearchParams({mode,bucket:'all',keywords,offset:String(offset)}),{headers:memberHeaders}));
  assert.equal(response.status,200);return response.json();
 };
 for(const mode of ['sfl','engineer','academy']){
  const pages=[];
  for(const offset of [0,12,24])pages.push(await get(mode,offset));
  assert.deepEqual(pages.map(page=>page.items.length),[12,12,3]);
  assert.ok(pages.every(page=>page.total===27));
  assert.equal(new Set(pages.flatMap(page=>page.items.map(item=>item.id))).size,27);
  assert.deepEqual((await get(mode)).items.map(item=>item.id),pages[0].items.map(item=>item.id));
  assert.equal((await get(mode,0,'見つからない検索語')).items.length,0);
 }
 reset();await store.saveDiscovered(Array.from({length:4},(_,i)=>candidate(`Webサイト制作 ${i}`,`https://www.mod.go.jp/msdf/few-${i}.pdf`)));
 assert.equal((await get('sfl')).items.length,4);
});
test('API collection saves unknown and future candidates, then splits a capped request without dropping query terms',async()=>{
 reset();await collector.startCollection();const urls=[];globalThis.fetch=async url=>{urls.push(new URL(url));return new Response('<Results><SearchResults><SearchHits>1000</SearchHits><SearchResult><ProjectName>生成AI 職員研修</ProjectName><ExternalDocumentURI>https://www.mod.go.jp/gsdf/notice.pdf</ExternalDocumentURI><OrganizationName>防衛省</OrganizationName><ProjectDescription>全省庁統一資格を有する者。生成AIの職員研修。見積書提出期限2099年9月30日。</ProjectDescription></SearchResult><SearchResult><ProjectName>生成AI 締切不明の職員研修</ProjectName><ExternalDocumentURI>https://www.mod.go.jp/gsdf/unknown.pdf</ExternalDocumentURI><OrganizationName>防衛省</OrganizationName><ProjectDescription>全省庁統一資格を有する者。生成AIの研修です。</ProjectDescription></SearchResult></SearchResults></Results>')};
 await collector.stepCollection();const state=JSON.parse(sql.prepare('SELECT data FROM discovery_runtime WHERE key=?').get('shared-collection-v1').data);
 assert.equal(urls[0].searchParams.has('CFT_Issue_Date'),false);const split=state.api.slice(-2);assert.equal(state.api[0].from,undefined);assert.notDeepEqual(state.api[0].terms,split[0].terms);assert.ok(split[0].from);assert.deepEqual(split[0].terms,split[1].terms);assert.equal(split[0].terms.join(' OR '),urls[0].searchParams.get('Query'));assert.equal(split[0].to,new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}));
 assert.equal((await store.discoveryFeed(actor,options({mode:'sfl'}))).items.length,1);assert.equal((await store.discoveryFeed(actor,options({mode:'sfl',bucket:'attention'}))).items.length,1);
 globalThis.fetch=originalFetch;
});
test('concurrent collection calls share a lease and provider refusals pause without fake zero success',async()=>{
 reset();await collector.startCollection();let release;let began;const started=new Promise(r=>began=r);globalThis.fetch=async()=>{began();return new Promise(r=>release=r)};
 const first=collector.stepCollection();await started;await assert.rejects(()=>collector.stepCollection(),e=>e.status===409&&e.code==='collection_busy');
 await assert.rejects(()=>collector.stepCollection(),error=>error.code==='collection_busy');
 release(new Response('refused',{status:403}));await first;
 const progress=await collector.collectionProgress();assert.equal(progress.status,'paused');assert.match(progress.message,/403/);assert.ok(progress.pending>0);globalThis.fetch=originalFetch;
});
test('oversized API responses reduce the batch without dropping the query, then persist real-shaped results',async()=>{
 reset();await collector.startCollection();const urls=[];
 globalThis.fetch=async raw=>{const url=new URL(raw);urls.push(url);if(url.searchParams.get('Count')==='50')return new Response('oversized',{headers:{'content-length':'12000000'}});return new Response('<Results><SearchResults><SearchHits>1</SearchHits><SearchResult><ProjectName>生成AI 職員研修</ProjectName><ExternalDocumentURI>https://www.mod.go.jp/gsdf/training.pdf</ExternalDocumentURI><OrganizationName>防衛省</OrganizationName><ProjectDescription>全省庁統一資格を有する者。見積書提出期限2099年9月30日</ProjectDescription></SearchResult></SearchResults></Results>');};
 try {
  await collector.stepCollection();
  let state=JSON.parse(sql.prepare('SELECT data FROM discovery_runtime WHERE key=?').get('shared-collection-v1').data);
  assert.equal(state.api[0].count,10);assert.equal(state.saved,0);assert.equal(state.apiIssues.length,0);
  // Advance the test clock/rotation only, retaining the exact queued retry.
  state.nextAt=0;state.turn=0;sql.prepare('UPDATE discovery_runtime SET data=? WHERE key=?').run(JSON.stringify(state),'shared-collection-v1');
  await collector.stepCollection();
  assert.equal(urls[0].searchParams.get('Count'),'50');assert.equal(urls[1].searchParams.get('Count'),'10');
  assert.equal(urls[0].searchParams.get('Query'),urls[1].searchParams.get('Query'));
  assert.equal(urls[0].searchParams.get('CFT_Issue_Date'),urls[1].searchParams.get('CFT_Issue_Date'));
  assert.equal((await store.discoveryFeed(actor,options({mode:'sfl'}))).items.length,1);
 } finally {globalThis.fetch=originalFetch;}
});
test('robots exclusions apply before fetching and date splitting makes contiguous disjoint ranges',()=>{
 assert.equal(transport.robotsAllows('User-agent: *\nDisallow: /a/\nDisallow: /gsdf/private/','/gsdf/private/notice.pdf'),false);
 assert.equal(transport.robotsAllows('User-agent: *\nDisallow: /a/','/gsdf/notice.pdf'),true);
 const parts=collector.splitApiTask({terms:['清掃'],from:'2026-09-01',to:'2026-09-30',depth:1});assert.equal(parts[0].from,'2026-09-16');assert.equal(parts[1].to,'2026-09-15');
});
test('manual deadline confirmation requires a future date and records original evidence before review',async()=>{
 reset();await store.saveDiscovered([candidate(undefined,undefined,{deadline:''})]);const id=(await store.discoveryFeed(actor,options({bucket:'attention'}))).items[0].id;
 assert.equal((await route.POST(req({action:'confirm-deadline',mode:'engineer',id,deadline:'2000-01-01',evidence:'見積書の締切は2000年1月1日'}))).status,400);
 assert.equal((await route.POST(req({action:'confirm-deadline',mode:'engineer',id,deadline:'2099-09-30',evidence:'見積書提出期限2099年9月30日17時'}))).status,200);
 const item=(await store.discoveryFeed(actor,options({bucket:'reviewed'}))).items[0];assert.equal(item.deadline,'2099-09-30');assert.match(item.deadlineEvidence,/原文を/);
});

const readState=()=>JSON.parse(sql.prepare('SELECT data FROM discovery_runtime WHERE key=?').get('shared-collection-v1').data);
const writeState=state=>sql.prepare('UPDATE discovery_runtime SET data=? WHERE key=?').run(JSON.stringify(state),'shared-collection-v1');
test('live transport policy records provider 403/404 and continues the collection without rendering or retrying denied pages',async()=>{
 reset();await collector.startCollection();const state=readState();
 state.api=[];state.mainPending=false;state.browsers=state.browsers.filter(b=>b.sourceId==='asdf');
 const job=state.browsers[0],denied='https://www.mod.go.jp/asdf/unit0/list.html',missing='https://www.mod.go.jp/asdf/unit1/list.html';
 job.queue=[{url:denied,target:0,depth:1,kind:'navigation'},{url:missing,target:1,depth:1,kind:'navigation'}];writeState(state);
 const calls=[];
 globalThis.fetch=async url=>{calls.push(String(url));return String(url).endsWith('/robots.txt')?new Response('User-agent: *\nDisallow: /a/'):new Response('',{status:String(url)===denied?403:404});};
 try{
  await collector.stepCollection();let current=readState();assert.equal(current.status,'running');assert.equal(current.browsers[0].status,'running');
  current.nextAt=0;writeState(current);await collector.stepCollection();
  const progress=await collector.collectionProgress(),source=progress.sources.find(s=>s.name==='航空自衛隊');
  assert.deepEqual(source.pageIssues.map(i=>i.status),[403,404]);assert.deepEqual(calls,['https://www.mod.go.jp/robots.txt',denied,missing]);
  assert.equal(progress.saved,0);assert.equal(progress.status,'failed');assert.match(progress.message,/存在しないという意味ではありません/);
 }finally{globalThis.fetch=originalFetch;}
});
test('the production redirect-error state is reported as failed and can retry without the six-hour success cooldown',async()=>{
 reset();await collector.startCollection(['独自研修']);const old=readState();
 old.status='completed';old.api=[];old.processed=21;old.apiProcessed=17;old.saved=0;
 old.apiIssues=Array(10).fill('Invalid redirect value, must be one of "follow" or "manual"');
 old.browsers=[];old.mainPending=false;writeState(old);
 let progress=await collector.collectionProgress();assert.equal(progress.status,'failed');assert.equal(progress.retryable,true);assert.match(progress.message,/修正済み/);
 await collector.startCollection();const next=readState();assert.equal(next.status,'running');assert.ok(next.api.some(t=>t.terms.includes('独自研修')));assert.equal(next.apiIssues.length,0);assert.equal(next.browsers.length,3);
 globalThis.fetch=async (url,init)=>{
  // Reproduce the edge platform's restriction rather than silently accepting
  // an unsupported RequestInit as the old Node-only fixtures did.
  assert.equal(init.redirect,'manual');
  return new Response('<Results><SearchResults><SearchHits>1</SearchHits><SearchResult><ProjectName>生成AI 職員研修</ProjectName><ExternalDocumentURI>https://www.mod.go.jp/gsdf/recovered.pdf</ExternalDocumentURI><OrganizationName>防衛省</OrganizationName><ProjectDescription>全省庁統一資格を有する者。見積書提出期限2099年9月30日</ProjectDescription></SearchResult></SearchResults></Results>');
 };
 try {await collector.stepCollection();assert.equal((await store.discoveryFeed(actor,options({mode:'sfl'}))).items.length,1);assert.equal((await collector.collectionProgress()).saved,1);}finally{globalThis.fetch=originalFetch;}
});
test('failed API conditions persist, are not a successful zero, and retry only after a bounded cooldown',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-12T13:00:00Z')});reset();await collector.startCollection();
 let state=readState();const task=state.api[0];state.api=[task];state.browsers=[];state.mainPending=false;writeState(state);
 globalThis.fetch=async()=>new Response('unavailable',{status:503});
 try {
  await collector.stepCollection();let progress=await collector.collectionProgress();
  assert.equal(progress.status,'failed');assert.equal(progress.saved,0);assert.equal(progress.retryable,true);assert.deepEqual(readState().failedApi,[task]);
  await assert.rejects(()=>collector.startCollection(),e=>e.status===429);
  t.mock.timers.tick(5*60000);await collector.startCollection();assert.deepEqual(readState().api,[task]);assert.equal(readState().mainPending,false);assert.equal(readState().browsers.length,0);
  globalThis.fetch=async()=>new Response('<Results><SearchResults><SearchHits>0</SearchHits></SearchResults></Results>');
  await collector.stepCollection();progress=await collector.collectionProgress();assert.equal(progress.status,'completed');assert.equal(progress.retryable,false);
  await assert.rejects(()=>collector.startCollection(),e=>e.status===429);
 } finally{globalThis.fetch=originalFetch;}
});
test('robots checks work with edge-compatible redirects, and relocated robots never allow a page fetch',async()=>{
 reset();const calls=[];
 globalThis.fetch=async (url,init)=>{calls.push(String(url));assert.equal(init.redirect,'manual');return String(url).endsWith('/robots.txt')?new Response('not found',{status:404}):new Response('<html><body>調達情報の一覧です。入札公告と見積募集の掲載内容を確認するための公開ページ。</body></html>');};
 try {
  await transport.officialTransport.html('https://www.mod.go.jp/gsdf/test/index.html');assert.equal(calls.length,2);
  reset();calls.length=0;globalThis.fetch=async (url,init)=>{calls.push(String(url));assert.equal(init.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://external.example.test/robots.txt'}});};
  await assert.rejects(()=>transport.officialTransport.html('https://www.mod.go.jp/gsdf/test/index.html'),/移動/);assert.equal(calls.length,1);
 }finally{globalThis.fetch=originalFetch;}
});


test('saved conditions remain personal while qualification writes are locked',async()=>{
 const profile=workbench.companyProfileSchema.parse({name:'テスト会社',serviceGrade:'D',specialties:'研修'});
 const ownerReq=body=>req(body);
 assert.equal((await preferences.POST(ownerReq({action:'profile',profile}))).status,403);
 const saved=workbench.savedSearchSchema.parse({name:'研修案件',mode:'sfl',keywords:'研修',exclude:'工事',source:'all',category:'all',newOnly:false,filters:{}});
 assert.equal((await preferences.POST(ownerReq({action:'save-search',search:saved}))).status,200);
 assert.equal((await preferences.POST(ownerReq({action:'save-search',search:{...saved,source:'njss'}}))).status,400);
 const ownerGet=new Request('https://portal.example.test/api/procurement-workbench',{headers:{'oai-authenticated-user-id':actor.id,'oai-authenticated-user-email':actor.email}});
 const own=await(await preferences.GET(ownerGet)).json();assert.equal(own.profile.serviceGrade,'D');assert.equal(own.searches.length,1);
 const guestGet=new Request('https://portal.example.test/api/procurement-workbench',{headers:memberHeaders});
 const guest=await(await preferences.GET(guestGet)).json();assert.equal(guest.profile.name,'');assert.equal(guest.searches.length,0);
 const guestDelete=new Request(guestGet.url,{method:'POST',headers:{...memberHeaders,'Content-Type':'application/json'},body:JSON.stringify({action:'delete-search',id:own.searches[0].id})});await preferences.POST(guestDelete);
 assert.equal((await(await preferences.GET(ownerGet)).json()).searches.length,1);
 sql.prepare("UPDATE saved_procurement_searches SET data=json_set(data,'$.source','njss') WHERE id=?").run(own.searches[0].id);
 const migrated=await(await preferences.GET(ownerGet)).json();
 assert.equal(migrated.searches[0].source,'all');assert.equal(migrated.searches[0].keywords,'研修');
});

test('detailed search applies AND, title scope, dates and historic records without confusing them with award results',async()=>{
 reset();await store.saveDiscovered([candidate('Webサイト 研修','https://example.go.jp/1',{indexedDate:'2026-09-12',prefecture:'滋賀県'}),candidate('Webサイト 広報','https://example.go.jp/2',{descriptionText:'職員研修の告知',indexedDate:'2026-09-10'}),candidate('Webサイト 過去','https://example.go.jp/3',{deadline:'2001-01-01'})]);
 const filters=workbench.advancedSearchSchema.parse({match:'all',scope:'title',region:'滋賀',announcedFrom:'2026-09-11'});
 const feed=await store.discoveryFeed(actor,options({bucket:'all',keywords:['Webサイト','研修'],filters}));assert.equal(feed.total,1);assert.equal(feed.items[0].prefecture,'滋賀県');
 const past=await store.discoveryFeed(actor,options({bucket:'all',filters:workbench.advancedSearchSchema.parse({period:'closed'})}));assert.equal(past.total,1);assert.equal(past.items[0].title,'Webサイト 過去');
});

test('actual changed notices preserve previous deadline once and unchanged refreshes do not create revisions',async()=>{
 reset();const item=candidate();await store.saveDiscovered([item]);await store.saveDiscovered([item]);const id=await domain.discoveryIdentity(item);assert.equal((await store.discoveryHistory(id)).length,0);
 await store.saveDiscovered([{...item,deadline:'2099-10-01'}]);const history=await store.discoveryHistory(id);assert.equal(history.length,1);assert.equal(history[0].deadline,'2099-09-30');
 await store.saveDiscovered([{...item,deadline:'2099-10-01'}]);assert.equal((await store.discoveryHistory(id)).length,1);
});

test('company grade matching does not claim D eligibility for an A B C notice or an expired qualification',()=>{
 const item=candidate(undefined,undefined,{classification:{unifiedRequiredEvidence:'全省庁統一資格の役務の提供等でA、B又はC等級の資格を有する者'}});
 const profile=workbench.companyProfileSchema.parse({serviceGrade:'D',qualificationUntil:'2099-12-31'});
 const check=workbench.assessCandidate(item,profile).find(c=>c.label==='資格・等級');assert.equal(check.state,'attention');
 assert.equal(workbench.assessCandidate(item,{...profile,serviceGrade:'A',qualificationUntil:'2000-01-01'}).find(c=>c.label==='資格・等級').state,'attention');
 assert.equal(workbench.assessCandidate(candidate(),profile).find(c=>c.label==='資格・等級').state,'unknown');
});

test('question and briefing application deadlines remain separate from bid submission',()=>{
 const milestones=domain.milestonesFrom('説明会参加申込期限 令和8年9月17日。質問受付期限 令和8年9月18日。参加申請期限 令和8年9月20日。見積書提出期限 令和8年9月30日。');
 assert.deepEqual(milestones.map(m=>m.date),['2026-09-17','2026-09-18','2026-09-20']);
});

test('workflow persists with bid, revision conflicts preserve saved work and results feed real aggregates',async()=>{
 sql.exec('DELETE FROM bids');
 const workflow=workbench.workflowSchema.parse({tasks:[{id:'t1',title:'質問の提出',kind:'question',date:'2099-09-17',time:'17:00'}],result:{winner:'株式会社テスト',amount:'100000',tax:'excluded',sourceUrl:'https://example.go.jp/result'}});
 const created=await bidsStore.saveBid({...bidDomain.emptyBid,title:'実装検証',agency:'テスト機関',deadline:'2099-09-30',status:'won',submittedOn:bidDomain.todayJst(),workflow:JSON.stringify(workflow)},actor);
 assert.equal(workbench.readWorkflow(created.workflow).tasks[0].time,'17:00');
 const updated=await bidsStore.saveBid({...created,notes:'確認済み'},actor,{id:created.id,revision:1});assert.equal(updated.revision,2);
 await assert.rejects(()=>bidsStore.saveBid({...created,notes:'古い画面'},actor,{id:created.id,revision:1}),e=>e.code==='conflict');
 const report=await(await insights.GET(new Request('https://portal.example.test/api/bid-insights',{headers:memberHeaders}))).json();assert.equal(report.stats.won,1);assert.equal(report.competitors[0].excludedTotal,100000);assert.equal(report.competitors[0].includedTotal,0);
 const ics=workbench.taskCalendar(created);assert.match(ics,/DTSTART:20990917T080000Z/);assert.match(ics,/質問の提出/);
 await assert.rejects(()=>bidsStore.saveBid({...created,workflow:'{bad'},actor,{id:created.id,revision:2}),e=>e.status===400);
});

test('failed refresh keeps the successful deadline, body, version and last seen; recovery clears the warning',async()=>{
 reset();const item=candidate();await store.saveDiscovered([item]);
 const id=await domain.discoveryIdentity(item),before=sql.prepare('SELECT * FROM discovery_candidates WHERE id=?').get(id);
 await store.setDiscoveryReview(actor,'engineer',id,'reviewed','');
 await store.saveDiscovered([{...item,deadline:'',summary:'',descriptionText:'',retrievalIssue:{message:'HTTP 403',attemptedAt:Date.now()}}]);
 const failed=sql.prepare('SELECT * FROM discovery_candidates WHERE id=?').get(id),data=JSON.parse(failed.data);
 assert.equal(data.deadline,item.deadline);assert.equal(data.descriptionText,item.descriptionText);assert.equal(failed.last_seen,before.last_seen);assert.equal(failed.fingerprint,before.fingerprint);
 assert.equal((await store.discoveryHistory(id)).length,0);assert.equal((await store.discoveryFeed(actor,options({bucket:'attention'}))).items.length,1);
 await store.saveDiscovered([item]);assert.equal((await store.discoveryFeed(actor,options({bucket:'reviewed'}))).items.length,1);
 assert.equal(JSON.parse(sql.prepare('SELECT data FROM discovery_candidates WHERE id=?').get(id).data).retrievalIssue,undefined);
});
test('coverage exposes every configured target without inventing success times',async()=>{
 reset();await collector.startCollection();const progress=await collector.collectionProgress();
 const targets=progress.sources.flatMap(s=>s.targets??[]);assert.equal(targets.length,77);assert.ok(targets.every(t=>t.state==='pending'&&!t.lastSuccessAt));
});
test('weekly digest rejects missing/wrong credentials and counts actual new and changed records',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-16T00:00:00Z')});reset();
 const digestRoute=await vite.ssrLoadModule('/app/api/notifications/daily-digest/route.ts');
 const request=token=>new Request('https://portal.example.test/api/notifications/daily-digest',{method:'POST',headers:token?{authorization:'Bearer '+token}:{}});
 delete globalThis.discoveryTestEnv.LARK_DIGEST_TOKEN;assert.equal((await digestRoute.POST(request())).status,503);
 globalThis.discoveryTestEnv.LARK_DIGEST_TOKEN='test-only-token-012345678901234567890123456789';
 assert.equal((await digestRoute.POST(request('wrong'))).status,401);
 await store.saveDiscovered([candidate('Webサイト制作 期限間近',undefined,{deadline:'2026-09-18'})]);
 const threeDaysAgo=Date.now()-3*86400000;sql.prepare('UPDATE discovery_candidates SET first_seen=?,last_seen=?,changed_at=?').run(threeDaysAgo,threeDaysAgo,threeDaysAgo);
 const response=await digestRoute.POST(request(globalThis.discoveryTestEnv.LARK_DIGEST_TOKEN));assert.equal(response.status,200);
 const report=await response.json();assert.equal(report.date,'2026-09-16');assert.match(report.message,/過去7日間：新規保存 1件 \/ 内容更新 0件/);assert.match(report.message,/2026-09-18｜Webサイト制作/);assert.match(report.message,/自動収集は接続待ち/);
 delete globalThis.discoveryTestEnv.LARK_DIGEST_TOKEN;
});


test('saved results enforce qualification scope before counts and pagination for all audiences and saved searches',async()=>{
 reset();
 const make=(i,descriptionText,contractMethod='')=>candidate('研修 Webサイト 清掃 '+i,'https://www.mod.go.jp/notice/'+i,{descriptionText,contractMethod});
 const allowed=Array.from({length:25},(_,i)=>make(i,'全省庁統一資格を有する者。'));
 const excluded=[make('local','本市の入札参加資格者名簿に登載されていること。'),make('unknown','仕様書を参照。'),make('open-local','本県の競争入札参加資格者名簿に登録されている者。','オープンカウンター')];
 await store.saveDiscovered([...allowed,...excluded]);
 for(const mode of ['sfl','engineer','academy']){
   const first=await store.discoveryFeed(actor,options({mode,bucket:'all'}));
   const second=await store.discoveryFeed(actor,options({mode,bucket:'all',offset:20}));
   assert.equal(first.total,25);assert.equal(first.counts.all,25);assert.equal(first.qualificationExcluded,3);
   assert.equal(first.items.length,20);assert.equal(second.items.length,5);
   assert.ok([...first.items,...second.items].every(i=>i.classification.unifiedEligibleEvidence));
 }
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM discovery_candidates').get().n,28);
 // The same policy applies to previously stored JSON that has no new fields.
 const id=await domain.discoveryIdentity(excluded[0]);
 sql.prepare("UPDATE discovery_candidates SET data=json_set(data,'$.classification',json(?)) WHERE id=?").run(JSON.stringify({unifiedRequiredEvidence:'全省庁統一資格を有する者。'}),id);
 assert.equal((await store.discoveryFeed(actor,options({bucket:'all'}))).total,25);
});


test('weekly deadline highlights use the same qualification scope before limiting results',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-16T00:00:00Z')});reset();
 await store.saveDiscovered([
   ...Array.from({length:7},(_,i)=>candidate('表示しない自治体案件'+i,'https://example.test/local/'+i,{deadline:'2026-09-17',contractMethod:'オープンカウンター',descriptionText:'本県の入札参加資格者名簿に登録されている者。'})),
   candidate('対象となる研修案件','https://example.test/unified',{deadline:'2026-09-18',contractMethod:'',descriptionText:'全省庁統一資格を有する者。'}),
 ]);
 const {discoveryDigest}=await vite.ssrLoadModule('/lib/discovery-digest.ts');
 const report=await discoveryDigest();assert.match(report.message,/対象となる研修案件/);assert.doesNotMatch(report.message,/表示しない自治体案件/);
});


test('portal GSDF search prioritizes the 16-target official crawl and keeps API work saved',async()=>{
 reset();const urls=[];
 globalThis.fetch=async raw=>{const url=String(raw);urls.push(url);return new Response(url.endsWith('/robots.txt')?'User-agent: *\nAllow: /':'<html><head><title>公式調達案内</title></head><body>各部隊の調達情報は個別の掲載欄をご覧ください。</body></html>');};
 try{
  const response=await route.POST(req({action:'start',source:'gsdf',keywords:'広報'}));assert.equal(response.status,200);
  const run=JSON.parse(sql.prepare('SELECT data FROM discovery_runtime WHERE key=?').get('manual:owner:sfl').data).inspection.id;await collector.stepCollection('manual:owner:sfl',run);
  const state=JSON.parse(sql.prepare('SELECT data FROM discovery_runtime WHERE key=?').get('manual:owner:sfl').data);
  assert.equal(state.preferredSource,'gsdf');assert.equal(state.apiProcessed,0);assert.ok(state.api.length>0);
  assert.ok(urls.includes('https://www.mod.go.jp/gsdf/procurement_information/'));
  assert.equal(urls.some(url=>url.includes('kkj.go.jp')),false);
  const job=state.browsers.find(b=>b.sourceId==='gsdf');assert.equal(job.targets.length,16);
  assert.ok(job.queue.some(p=>p.url.endsWith('/kodaira/keiyaku/koukoku.html')));
 }finally{globalThis.fetch=originalFetch;}
});


test('portal ASDF search prioritizes all 28 official bases and exposes unreadable entries',async()=>{
 reset();const urls=[];
 globalThis.fetch=async raw=>{const url=String(raw);urls.push(url);return new Response(url.endsWith('/robots.txt')?'User-agent: *\nAllow: /':'<html><head><title>航空自衛隊調達情報</title></head><body>各基地の公式公告掲載先を確認してください。</body></html>');};
 try{
  assert.equal((await route.POST(req({action:'start',source:'asdf',keywords:'広報'}))).status,200);
  const run=JSON.parse(sql.prepare('SELECT data FROM discovery_runtime WHERE key=?').get('manual:owner:sfl').data).inspection.id;await collector.stepCollection('manual:owner:sfl',run);
  const state=JSON.parse(sql.prepare('SELECT data FROM discovery_runtime WHERE key=?').get('manual:owner:sfl').data);
  assert.equal(state.preferredSource,'asdf');assert.equal(state.apiProcessed,0);
  assert.ok(urls.includes('https://www.mod.go.jp/asdf/choutatsu/'));
  const job=state.browsers.find(b=>b.sourceId==='asdf');assert.equal(job.targets.length,28);
  assert.ok(job.targets.every((_,i)=>job.queue.some(p=>p.target===i)));
  assert.ok(job.queue.some(p=>p.url.endsWith('/fuchu/acs/open/index.html')));
 }finally{globalThis.fetch=originalFetch;}
});
test('portal MSDF search starts at the announcement index and prioritizes 33 bases',async()=>{
 reset();const urls=[];
 globalThis.fetch=async raw=>{const url=String(raw);urls.push(url);return new Response(url.endsWith('/robots.txt')?'User-agent: *\nAllow: /':'<html><head><title>海上自衛隊調達情報</title></head><body>各基地の公告掲載先へお進みください。</body></html>');};
 try{
  assert.equal((await route.POST(req({action:'start',source:'msdf',keywords:'広報'}))).status,200);
  const run=JSON.parse(sql.prepare('SELECT data FROM discovery_runtime WHERE key=?').get('manual:owner:sfl').data).inspection.id;await collector.stepCollection('manual:owner:sfl',run);
  const state=JSON.parse(sql.prepare('SELECT data FROM discovery_runtime WHERE key=?').get('manual:owner:sfl').data);
  assert.equal(state.preferredSource,'msdf');assert.equal(state.apiProcessed,0);
  assert.ok(urls.includes('https://www.mod.go.jp/msdf/bukei/nyusatsu_idx.html'));
  assert.equal(urls.some(url=>url.includes('kkj.go.jp')),false);
  const job=state.browsers.find(b=>b.sourceId==='msdf');assert.equal(job.targets.length,33);
  assert.ok(job.targets.every((_,i)=>job.queue.some(p=>p.target===i)));
 }finally{globalThis.fetch=originalFetch;}
});


test('fixed DDC grades override historical profile edits while preserving expiry evidence',()=>{
 const initial=workbench.companyProfileSchema.parse({});
 assert.equal(initial.goodsGrade,'D');assert.equal(initial.serviceGrade,'D');assert.equal(initial.purchaseGrade,'C');
 const migrated=workbench.readCompanyProfile(JSON.stringify({name:'合同会社SFL/LUCIA',goodsGrade:'',serviceGrade:'A',regions:'関東',qualificationUntil:'2099-03-31'}));
 assert.equal(migrated.goodsGrade,'D');assert.equal(migrated.serviceGrade,'D');assert.equal(migrated.purchaseGrade,'C');
 assert.equal(migrated.name,'合同会社SFL/LUCIA');assert.equal(migrated.regions,'関東');assert.equal(migrated.qualificationUntil,'2099-03-31');
 const saved=workbench.readCompanyProfile(JSON.stringify({...migrated,purchaseGrade:'B',goodsGrade:''}));
 assert.equal(saved.purchaseGrade,'C');assert.equal(saved.goodsGrade,'D');assert.equal(saved.qualificationUntil,'2099-03-31');
});

test('DDC qualification matching keeps sales, services and purchases separate without assuming rank eligibility',()=>{
 const profile=workbench.companyProfileSchema.parse({qualificationUntil:'2099-12-31'});
 const check=evidence=>workbench.assessCandidate(candidate(undefined,undefined,{classification:{unifiedEligibleEvidence:evidence}}),profile).find(c=>c.label==='資格・等級');
 for(const [category,grade] of [['物品の販売','D'],['役務の提供等','D'],['物品の買受け','C']]){
  const match=check(`全省庁統一資格の「${category}」で「${grade}」等級に格付けされている者。`);
  assert.equal(match.state,'match');assert.match(match.detail,new RegExp(category));
 }
 assert.equal(check('全省庁統一資格の物品の販売でA、B又はC等級の資格を有する者。').state,'attention');
 assert.equal(check('全省庁統一資格の役務の提供等でA、B又はC等級の資格を有する者。').state,'attention');
 assert.equal(check('全省庁統一資格の物品の買受けでD等級の資格を有する者。').state,'attention');
 assert.equal(check('全省庁統一資格の物品の買受けでC又はD等級の資格を有する者。').state,'match');
 assert.equal(check('全省庁統一資格の物品の販売でAからD等級の資格を有する者。').state,'unknown');
 assert.equal(check('全省庁統一資格の物品の販売でA、B又はC等級の資格を有する者。ただしD等級の参加を認める。').state,'unknown');
 assert.equal(check('全省庁統一資格の物品の販売でA等級又は役務の提供等でD等級の資格を有する者。').state,'unknown');
});

test('DDC search excludes definite grade mismatches, retains open counter and ignores historical grade overrides across modes',async()=>{
 reset();const profileActor={...actor,id:'ddc-profile-test'};
 const notice=(name,evidence,contractMethod='一般競争入札')=>candidate('Webサイト '+name,'https://example.go.jp/ddc/'+name,{descriptionText:evidence,qualifications:evidence,contractMethod});
 await store.saveDiscovered([
  notice('goods-d','全省庁統一資格の物品の販売でD等級の資格を有する者。'),
  notice('goods-abc','全省庁統一資格の物品の販売でA、B又はC等級の資格を有する者。'),
  notice('service-d','全省庁統一資格の役務の提供等でD等級の資格を有する者。'),
  notice('service-abc','全省庁統一資格の役務の提供等でA、B又はC等級の資格を有する者。'),
  notice('purchase-c','全省庁統一資格の物品の買受けでC等級の資格を有する者。'),
  notice('purchase-d','全省庁統一資格の物品の買受けでD等級の資格を有する者。'),
  notice('open','見積書を提出してください。','オープンカウンター'),
 ]);
 try{
  for(const mode of ['sfl','engineer','academy','free']){
   const feed=await store.discoveryFeed(profileActor,options({mode,bucket:'all',keywords:['Webサイト']}));
   assert.equal(feed.total,4);assert.equal(feed.qualificationExcluded,3);
   assert.deepEqual(feed.qualificationGrades,{goodsGrade:'D',serviceGrade:'D',purchaseGrade:'C'});
   assert.deepEqual(feed.items.map(i=>i.title).sort(),['goods-d','service-d','purchase-c','open'].map(n=>'Webサイト '+n).sort());
  }
  const saved=workbench.companyProfileSchema.parse({purchaseGrade:'D'});
  sql.prepare('INSERT INTO procurement_preferences(user_id,profile,updated_at) VALUES (?,?,?)').run(profileActor.id,JSON.stringify(saved),Date.now());
  for(const mode of ['sfl','engineer','academy','free']){
   const changed=await store.discoveryFeed(profileActor,options({mode,bucket:'all',keywords:['Webサイト']}));
   assert.ok(!changed.items.some(i=>i.title==='Webサイト purchase-d'));assert.ok(changed.items.some(i=>i.title==='Webサイト purchase-c'));
   assert.deepEqual(changed.qualificationGrades,{goodsGrade:'D',serviceGrade:'D',purchaseGrade:'C'});
  }
  const other=await store.discoveryFeed({...actor,id:'another-ddc-visitor'},options({bucket:'all',keywords:['Webサイト']}));
  assert.ok(other.items.some(i=>i.title==='Webサイト purchase-c'));
 }finally{sql.prepare('DELETE FROM procurement_preferences WHERE user_id=?').run(profileActor.id);}
});


test('quoted alternative grades include any matching registered grade even without the word grade',()=>{
 const profile=workbench.companyProfileSchema.parse({});
 const check=evidence=>workbench.candidateGradeCheck(candidate(undefined,undefined,{classification:{unifiedEligibleEvidence:evidence}}),profile).state;
 for(const [category,own] of [['物品の販売','D'],['役務の提供等','D'],['物品の買受け','C']]){
  for(let mask=1;mask<16;mask++){
   const grades=['A','B','C','D'].filter((_,i)=>mask&(1<<i));
   const list=grades.map(g=>`「${g}」`).join('、').replace(/、(?=「[A-D]」$)/,'又は');
   const expected=grades.includes(own)?'match':'mismatch';
   for(const suffix of ['', 'の等級に格付けされている者', 'に格付けされている者']){
    assert.equal(check(`全省庁統一資格の「${category}」の${list}${suffix}`),expected,category+list+suffix);
   }
  }
 }
 assert.equal(check('「役務の提供等」の「Ａ」、\n「Ｂ」、「Ｃ」又は「Ｄ」'),'match');
 assert.equal(check('全省庁統一資格の役務の提供等を有する者。納品する製品は「A」又は「B」'),'unknown');
});

test('quoted A B C or D service notices appear in portal searches across all three modes',async()=>{
 reset();const searchActor={...actor,id:'quoted-grades-test'};
 await store.saveDiscovered([
  candidate('Webサイト Dを含む公告','https://www.mod.go.jp/test/quoted-abcd.pdf',{contractMethod:'一般競争入札',qualifications:'全省庁統一資格において「役務の提供等」の「A」、「B」、「C」又は「D」に格付けされている者。'}),
  candidate('Webサイト Dを含まない公告','https://www.mod.go.jp/test/quoted-abc.pdf',{contractMethod:'一般競争入札',qualifications:'全省庁統一資格において「役務の提供等」の「A」、「B」又は「C」に格付けされている者。'}),
 ]);
 for(const mode of ['sfl','engineer','academy']){
  for(const category of ['all','unified-required']){
   const feed=await store.discoveryFeed(searchActor,options({mode,category,bucket:'all',keywords:['Webサイト']}));
   assert.equal(feed.total,1);assert.equal(feed.items[0].title,'Webサイト Dを含む公告');assert.equal(feed.qualificationExcluded,1);
  }
 }
});

test('synonym search preserves AND/OR groups, exact-only, source, title scope and direct-first ranking',async()=>{
 reset();
 await store.saveDiscovered([
  candidate('AI研修とWebサイト制作','https://www.mod.go.jp/msdf/exact.pdf',{descriptionText:'業務内容：AI研修とWebサイト制作を実施。'}),
  candidate('生成AI活用講習とホームページ制作','https://www.mod.go.jp/msdf/synonym.pdf',{descriptionText:'業務内容：生成AI活用講習とホームページ制作を実施。'}),
  candidate('生成AI活用講習','https://www.mod.go.jp/msdf/one.pdf',{descriptionText:'講習を実施。'}),
  candidate('技術支援','https://www.mod.go.jp/msdf/body-synonym.pdf',{descriptionText:'生成AI活用講習とホームページ制作。'}),
  candidate('生成AI活用講習とホームページ制作（陸自）','https://www.mod.go.jp/gsdf/other.pdf',{agency:'防衛省 陸上自衛隊',descriptionText:'業務内容：生成AI活用講習とホームページ制作。'}),
 ]);
 const search=filters=>store.discoveryFeed(actor,options({mode:'sfl',source:'msdf',bucket:'all',keywords:['AI研修','Webサイト'],filters:workbench.advancedSearchSchema.parse(filters)}));
 const all=await search({match:'all'});
 assert.equal(all.total,3);assert.equal(all.items[0].title,'AI研修とWebサイト制作');
 const expanded=all.items.find(i=>i.title.startsWith('生成AI'));
 assert.deepEqual(expanded.expandedMatches.map(m=>m.input),['AI研修','Webサイト']);
 assert.equal(expanded.expandedMatches[0].term,'生成AI活用講習');assert.match(expanded.reasons.join(' '),/言い換え/);
 assert.equal((await search({match:'any'})).total,4);
 assert.equal((await search({match:'all',synonyms:'off'})).total,1);
 assert.equal((await search({match:'all',scope:'title'})).total,2);
 assert.equal((await search({match:'any',scope:'title'})).total,3);
});

test('synonyms do not bypass issuer-only exclusion, qualification grades or expired notice filters',async()=>{
 reset();
 await store.saveDiscovered([
  candidate('備品購入','https://www.mod.go.jp/msdf/issuer.pdf',{agency:'ホームページ制作支援機関',descriptionText:'ホームページ制作支援機関。備品を購入する。'}),
  candidate('ホームページ制作 ABC限定','https://www.mod.go.jp/msdf/grade.pdf',{contractMethod:'',descriptionText:'全省庁統一資格「役務の提供等」の「A」、「B」又は「C」の資格を有する者。'}),
  candidate('ホームページ制作 D対象','https://www.mod.go.jp/msdf/grade-d.pdf',{contractMethod:'',descriptionText:'全省庁統一資格「役務の提供等」の「A」、「B」、「C」又は「D」の資格を有する者。'}),
  candidate('ホームページ制作 締切済み','https://www.mod.go.jp/msdf/expired-synonym.pdf',{deadline:'2000-01-01'}),
  candidate('ホームページ制作 オープンカウンター','https://www.mod.go.jp/msdf/oc-synonym.pdf'),
 ]);
 const feed=await store.discoveryFeed({...actor,id:'synonym-ddc'},options({bucket:'all',keywords:['Webサイト制作']}));
 assert.deepEqual(feed.items.map(i=>i.title).sort(),['ホームページ制作 D対象','ホームページ制作 オープンカウンター']);
 assert.equal(feed.qualificationExcluded,1);
});

test('synonym switch defaults safely for old searches, persists off and reaches collection terms',async()=>{
 const synonyms=await vite.ssrLoadModule('/lib/procurement-synonyms.ts');
 assert.equal(workbench.advancedSearchSchema.parse({}).synonyms,'on');
 const saved=workbench.savedSearchSchema.parse({name:'直接一致のみ',mode:'sfl',keywords:'AI研修',exclude:'',source:'all',category:'all',newOnly:false,filters:{synonyms:'off'}});
 assert.equal(workbench.savedSearchSchema.parse(JSON.parse(JSON.stringify(saved))).filters.synonyms,'off');
 assert.deepEqual(synonyms.expandedKeywords(['AI研修'],false),['AI研修']);
 assert.deepEqual(synonyms.keywordGroups(['未登録の固有語']),[{input:'未登録の固有語',terms:['未登録の固有語']}]);
 for(const toggle of ['on','off']) {
  reset();const response=await route.POST(req({action:'start',source:'msdf',keywords:'AI研修',synonyms:toggle}));
  assert.equal(response.status,200);
  const state=JSON.parse(sql.prepare('SELECT data FROM discovery_runtime WHERE key=?').get('manual:owner:sfl').data);
  assert.equal(state.knownTerms.includes('生成AI活用講習'),toggle==='on');
 }
});

test('summary fields retain original evidence, distinguish deadlines and preserve submission prohibitions',async()=>{
 const {procurementBrief}=await vite.ssrLoadModule('/lib/procurement-brief.ts');
 const item=domain.enrichCandidate(candidate('Webサイト制作',undefined,{descriptionText:'業務内容：Webサイトの制作と保守を実施。\n履行場所：東京都内の指定施設。\n納入期限：2099年12月20日。\n見積書の提出方法：持参又は郵送。電子メールでの提出は不可。\n質問は電子メールで送付。',milestones:[{label:'参加申請期限',date:'2099-09-20',evidence:'参加申請期限：2099年9月20日'}]}));
 const fields=procurementBrief(item),find=label=>fields.find(f=>f.label===label);
 assert.match(find('仕事内容').value,/制作と保守/);assert.match(find('履行・納品場所').value,/東京都/);
 assert.equal(find('入札・見積締切').value,'2099-09-30');assert.match(find('入札・見積締切').evidence,/見積書提出期限/);
 assert.match(find('先に必要な手続き').value,/2099-09-20/);
 assert.match(find('提出方法（原文抜粋）').value,/持参又は郵送/);
 assert.match(find('提出方法（原文抜粋）').value,/電子メールでの提出は不可/);
 const negative=procurementBrief(candidate('見積案件',undefined,{descriptionText:'見積書の提出方法：電子メールでの提出は不可、持参のみ。'}));
 assert.match(negative.find(f=>f.label==='提出方法（原文抜粋）').value,/不可、持参のみ/);
 const unknown=procurementBrief(candidate('件名のみ',undefined,{deadline:'',descriptionText:'見積書提出期限は2099年9月30日、質問は電子メールで送付。',summary:'推測で補わない'}));
 for(const label of ['資格条件','入札・見積締切','先に必要な手続き','提出方法（原文抜粋）','履行・納品場所'])assert.equal(unknown.find(f=>f.label===label).unknown,true,label);
 assert.equal(unknown[0].value,'件名のみ');
});

test('work summary isolates labelled work from flattened notices and keeps evidence without inventing a scope',async()=>{
 const {procurementBrief}=await vite.ssrLoadModule('/lib/procurement-brief.ts');
 const work=descriptionText=>procurementBrief(candidate('生成AIシステムの導入',undefined,{descriptionText}))[0];
 const flattened='令和8年8月25日契約担当役 独立行政法人統計センター理事長 1 契約担当者の役職及び氏名 2 競争入札に付する事項(1) 件名 生成AIシステムの導入(2) 業務内容 仕様書のとおり(3) 履行期間 仕様書のとおり(4) 入札方法 入札金額は、総額を記入すること。';
 assert.deepEqual(work(flattened),{label:'仕事内容',value:'仕様書のとおり',evidence:'業務内容 仕様書のとおり'});
 const multiline='２ 業務概要\nWebサイトの制作と\n保守を実施する。研修は含まない。\n３ 履行期間\n契約日から年度末まで。';
 assert.equal(work(multiline).value,'Webサイトの制作と 保守を実施する。研修は含まない。');
 assert.match(work(multiline).evidence,/業務概要\n/);
 assert.equal(work('作業内容：機器の設置。\n納入場所：東京都内。').value,'機器の設置。');
 assert.equal(work('業務内容\n(3) 履行期間 契約日から年度末。').value,'生成AIシステムの導入');
 assert.equal(work('業務内容についての質問はメールで受け付ける。').value,'生成AIシステムの導入');
 assert.equal(work('問い合わせ先：業務内容 担当部署へ連絡。').value,'生成AIシステムの導入');
 assert.equal(work('業務内容：'+ '非常に長い本文'.repeat(60)).value,'生成AIシステムの導入');
});

test('summary card renders open-counter, stale data, match reasons, evidence and original actions',async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {OpportunityCards}=await vite.ssrLoadModule('/app/opportunity-cards.tsx');
 const item=candidate('ホームページ制作',undefined,{id:'card-test',review:'new',classification:{openCounterEvidence:'オープンカウンター'},expandedMatches:[{input:'Webサイト',term:'ホームページ',location:'title'}],retrievalIssue:{message:'HTTP 503',attemptedAt:Date.now()}});
 const html=renderToStaticMarkup(React.createElement(OpportunityCards,{items:[item],today:'2026-09-16',busyId:'',onDetails(){},onReview(){},renderRegistration:()=>React.createElement('button',null,'Larkへ登録')}));
 for(const text of ['オープンカウンター','言い換え一致','仕事内容','資格条件','入札・見積締切','先に必要な手続き','提出方法','履行・納品場所','根拠を見る','前回の情報','詳しく見る','確認済みにする','Larkへ登録'])assert.ok(html.includes(text),text);
 assert.ok(html.includes('aria-haspopup="dialog"'));assert.ok(html.includes('https://www.mod.go.jp/msdf/bukei/notice.pdf'));
});

test('fixed qualification API rejects grade and expiry edits for owners, members and anonymous visitors',async()=>{
 const identities=[{id:actor.id,headers:{'oai-authenticated-user-id':actor.id,'oai-authenticated-user-email':actor.email}},{id:accountActor.id,headers:memberHeaders},{id:'guest:'+'b'.repeat(64),headers:{cookie:'__Host-bid-guest='+'b'.repeat(64)}}];
 for(const identity of identities){
  const existing=JSON.stringify({...workbench.emptyCompanyProfile,goodsGrade:'A',serviceGrade:'B',purchaseGrade:'D',qualificationUntil:'2099-03-31'});
  sql.prepare('INSERT INTO procurement_preferences(user_id,profile,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET profile=excluded.profile').run(identity.id,existing,Date.now());
  const request=new Request('https://portal.example.test/api/procurement-workbench',{method:'POST',headers:{...identity.headers,'Content-Type':'application/json'},body:JSON.stringify({action:'profile',profile:{...workbench.emptyCompanyProfile,goodsGrade:'A',qualificationUntil:'2100-12-31'}})});
  const response=await preferences.POST(request);const isGuest=identity.id.startsWith('guest:');assert.equal(response.status,isGuest?401:403);assert.equal((await response.json()).code,isGuest?'member_login_required':'qualification_locked');
  assert.equal(sql.prepare('SELECT profile FROM procurement_preferences WHERE user_id=?').get(identity.id).profile,existing,'rejected changes must not overwrite stored expiry evidence');
  if(isGuest){assert.equal((await preferences.GET(new Request(request.url,{headers:identity.headers}))).status,401);continue;}
  const read=await(await preferences.GET(new Request(request.url,{headers:identity.headers}))).json();
  assert.equal(read.profile.goodsGrade,'D');assert.equal(read.profile.serviceGrade,'D');assert.equal(read.profile.purchaseGrade,'C');assert.equal(read.profile.qualificationUntil,'2099-03-31');
  sql.prepare('DELETE FROM procurement_preferences WHERE user_id=?').run(identity.id);
 }
});

test('open-counter feature covers every work type and mode while enforcing category, DDC, dates, filters and pagination',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-16T03:00:00Z')});reset();
 const feature=await vite.ssrLoadModule('/app/api/open-counter/route.ts');
 const oc=(name,extra={})=>candidate(name,'https://www.mod.go.jp/msdf/feature-'+encodeURIComponent(name)+'.pdf',{title:name,descriptionText:'軍手の購入。オープンカウンター方式で見積合わせを行う。',summary:'軍手の購入。',deadline:'2026-09-20',...extra});
 await store.saveDiscovered([
  oc('軍手の購入'),oc('期限不明',{deadline:''}),oc('古い保存案件',{deadline:'2026-10-01'}),
  oc('終了',{deadline:'2026-09-15'}),oc('当日',{deadline:'2026-09-16'}),
  oc('一般競争',{contractMethod:'一般競争入札',descriptionText:'全省庁統一資格。役務の提供等D等級。',summary:'一般競争入札'}),
  oc('等級不一致',{descriptionText:'オープンカウンター。全省庁統一資格において物品の販売A等級を有する者。'}),
  oc('自治体の独自資格',{agency:'滋賀県',descriptionText:'オープンカウンター。滋賀県の入札参加資格者名簿への登録が必要。'}),
  oc('陸自の軍手',{officialUrl:'https://www.mod.go.jp/gsdf/feature-gloves.pdf',agency:'陸上自衛隊',source:'陸上自衛隊',searchSourceId:'gsdf'}),
 ]);
 sql.prepare("UPDATE discovery_candidates SET first_seen=? WHERE json_extract(data,'$.title')=?").run(Date.now()-10*86400000,'古い保存案件');
 const get=async(params='')=>{
  const response=await feature.GET(new Request('https://portal.example.test/api/open-counter?'+params,{headers:{'oai-authenticated-user-id':actor.id,'oai-authenticated-user-email':actor.email}}));
  assert.equal(response.status,200);return response.json();
 };
 for(const mode of ['sfl','engineer','academy']){
  const feed=await get('mode='+mode+'&category=all&period=all&keywords=存在しない語');
  assert.deepEqual(new Set(feed.items.map(i=>i.title)),new Set(['軍手の購入','期限不明','古い保存案件','陸自の軍手']));
  assert.deepEqual(feed.qualificationGrades,{goodsGrade:'D',serviceGrade:'D',purchaseGrade:'C'});
  assert.equal(feed.items.at(-1).title,'期限不明');
 }
 assert.deepEqual(new Set((await get('view=soon')).items.map(i=>i.title)),new Set(['軍手の購入','陸自の軍手']));
 assert.deepEqual((await get('view=attention')).items.map(i=>i.title),['期限不明']);
 assert.equal((await get('view=new')).items.some(i=>i.title==='古い保存案件'),false);
 assert.deepEqual((await get('source=gsdf')).items.map(i=>i.title),['陸自の軍手']);
 for(let i=0;i<25;i++)await store.saveDiscovered([oc('追加軍手'+i)]);
 const first=await get(),second=await get('offset=12'),third=await get('offset=24');
 assert.equal(first.items.length,12);assert.equal(second.items.length,12);assert.equal(third.items.length,5);assert.equal(first.total,29);
 assert.equal(new Set([...first.items,...second.items,...third.items].map(i=>i.id)).size,29);
 assert.equal((await feature.GET(new Request('https://portal.example.test/api/open-counter?source=njss',{headers:{'oai-authenticated-user-id':actor.id,'oai-authenticated-user-email':actor.email}}))).status,400);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM lark_bid_registrations').get().n,0,'opening the feature never registers records');
});

test('short English keywords match actual work, not fragments of mail, chair or facility',async()=>{
 reset();
 const rows=[
  ['AI研修','ＡＩ の活用を研修する。'],
  ['AI training services','Training using AI tools.'],
  ['生成ＡＩの講習','生成ＡＩの講習を実施。'],
  ['技術支援','業務は AI training とする。'],
  ['chair supply','Email contact only; chairs are supplied.'],
  ['facility maintenance','Repair the facility.'],
  ['IT支援','IT の導入支援。'],
  ['備品購入','ＡＩ 研修センター。備品を購入する。','AI研修センター'],
 ];
 await store.saveDiscovered(rows.map(([title,descriptionText,agency],i)=>candidate(title,`https://example.go.jp/accuracy/${i}`,{descriptionText,...(agency?{agency}:{})})));
 const find=async(keywords,scope='fulltext')=>(await store.discoveryFeed(actor,options({bucket:'all',keywords,filters:workbench.advancedSearchSchema.parse({scope})}))).items.map(v=>v.title).sort();
 assert.deepEqual(await find(['AI']),['AI training services','AI研修','技術支援','生成ＡＩの講習'].sort());
 assert.deepEqual(await find(['ＡＩ'],'title'),['AI training services','AI研修','生成ＡＩの講習'].sort());
 assert.deepEqual(await find(['IT']),['IT支援']);
});

test('bounded cursor scanning preserves counts, order and twelve-item pagination across batches',async(t)=>{
 reset();
 await store.saveDiscovered(Array.from({length:503},(_,i)=>candidate(`研修の調達 ${i}`,`https://example.go.jp/speed/${i}`)));
 sql.prepare('UPDATE discovery_candidates SET first_seen=?,changed_at=?').run(1000,1000);
 const expected=sql.prepare('SELECT id FROM discovery_candidates ORDER BY id').all().map(v=>v.id);
 queryTrace=[];
 try{
  const first=await store.discoveryFeed(actor,options({mode:'sfl',keywords:['研修'],pageSize:12}));
  assert.equal(first.total,503);assert.equal(first.counts.recommended,503);assert.equal(first.truncated,false);
  assert.deepEqual(first.items.map(v=>v.id),expected.slice(0,12));
  const reads=queryTrace.filter(query=>query.includes('ORDER BY id LIMIT'));
  assert.equal(reads.length,3,'503 full records need three bounded database reads');
  assert.ok(reads.every(query=>!query.includes('OFFSET')),'later batches do not rescan earlier records');
  t.diagnostic('503 saved candidates: scan queries reduced from 6 to 3; results and page size preserved.');
  const last=await store.discoveryFeed(actor,options({mode:'sfl',keywords:['研修'],pageSize:12,offset:492}));
  assert.deepEqual(last.items.map(v=>v.id),expected.slice(492));assert.equal(last.items.length,11);
 }finally{queryTrace=null;}
});

test('requested keywords lead collection without discarding pending conditions or shortening upstream cooldown',async()=>{
 reset();await collector.startCollection(['独自の設備研修']);
 assert.equal(readState().api[0].terms[0],'独自の設備研修');
 const before=readState().api.map(task=>JSON.stringify(task));
 await collector.startCollection(['新しい設計支援']);
 const prioritized=readState();assert.ok(prioritized.api[0].terms.includes('新しい設計支援'));
 for(const task of before)assert.ok(prioritized.api.some(current=>JSON.stringify(current)===task));
 let requests=0;
 globalThis.fetch=async url=>{requests++;assert.match(new URL(url).searchParams.get('Query'),/新しい設計支援/);return new Response('<Results><SearchResults><SearchHits>0</SearchHits></SearchResults></Results>');};
 try{
  await collector.stepCollection();const progress=await collector.collectionProgress();
  assert.ok(progress.nextAt>Date.now());
  await collector.stepCollection();assert.equal(requests,1,'immediate polling never bypasses the five-second cooldown');
 }finally{globalThis.fetch=originalFetch;}
});


test('status endpoint reads collector progress without searching notices or advancing collection',async()=>{
 reset();await collector.startCollection(['研修']);
 const progressRoute=await vite.ssrLoadModule('/app/api/discovery/progress/route.ts');
 const before=await collector.collectionProgress();
 queryTrace=[];const previousFetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw new Error('status must not fetch any upstream source');};
 try{
  const response=await progressRoute.GET(new Request('https://portal.example.test/api/discovery/progress',{headers:memberHeaders}));
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.deepEqual((await response.json()).progress,JSON.parse(JSON.stringify(before)));
  assert.ok(queryTrace.some(query=>query.includes('SELECT data FROM discovery_runtime')));
  assert.ok(queryTrace.every(query=>!query.includes('discovery_candidates')),'no search of saved notices');
  assert.ok(queryTrace.every(query=>!/(?:UPDATE|INSERT INTO|DELETE FROM) discovery_runtime/i.test(query)),'no collector mutation');
 }finally{queryTrace=null;globalThis.fetch=previousFetch;}
});


test('multiple prefectures use OR and combine with inclusive submission dates and saved filters',async()=>{
 reset();await store.saveDiscovered([
  candidate('研修 滋賀','https://example.go.jp/shiga',{prefecture:'滋賀県',deadline:'2099-09-20'}),
  candidate('研修 京都','https://example.go.jp/kyoto',{prefecture:'京都府',deadline:'2099-09-30'}),
  candidate('研修 大阪','https://example.go.jp/osaka',{prefecture:'大阪府',deadline:'2099-09-25'}),
  candidate('研修 東京','https://example.go.jp/tokyo',{prefecture:'東京都',deadline:'2099-09-25'}),
  candidate('研修 未確認','https://example.go.jp/unknown',{deadline:'2099-09-25'}),
  candidate('研修 締切未確認','https://example.go.jp/undated',{prefecture:'京都府',deadline:'',deadlineEvidence:''}),
 ]);
 const get=async filters=>{const response=await route.GET(new Request('https://portal.example.test/api/discovery?'+new URLSearchParams({mode:'sfl',bucket:'all',keywords:'研修',...filters}),{headers:memberHeaders}));assert.equal(response.status,200);return (await response.json()).items.map(item=>item.title).sort();};
 assert.deepEqual(await get({region:'滋賀県、京都府',deadlineFrom:'2099-09-20',deadlineTo:'2099-09-30'}),['研修 京都','研修 滋賀']);
 assert.deepEqual(await get({region:'滋賀県、京都府',deadlineTo:'2099-09-29'}),['研修 滋賀']);
 assert.deepEqual(await get({region:'滋賀県、京都府',deadlineFrom:'2099-09-21'}),['研修 京都']);
 assert.deepEqual(await get({region:'京都府',deadlineTo:'2099-09-30'}),['研修 京都'],'京都府 does not include 東京都');
 assert.equal((await get({deadlineFrom:'2099-09-20',deadlineTo:'2099-09-30'})).length,5,'clearing prefectures includes records with unknown location');
 const {prefectures}=await vite.ssrLoadModule('/lib/prefectures.ts');
 assert.equal(new Set(prefectures).size,47);
 assert.equal((await get({region:prefectures.join('、'),deadlineTo:'2099-09-30'})).length,4,'all 47 choices fit the API limit');
 const restored=workbench.simplifiedSearchFilters({region:'滋賀、京都府',agency:'非表示の機関',scope:'title',match:'all',announcedFrom:'2099-09-01',period:'closed',sort:'newest',synonyms:'off',deadlineTo:'2099-09-30'});
 assert.equal(restored.region,'滋賀県、京都府');assert.equal(restored.agency,'');assert.equal(restored.scope,'fulltext');assert.equal(restored.match,'any');assert.equal(restored.period,'future');assert.equal(restored.sort,'recommended');assert.equal(restored.announcedFrom,'');assert.equal(restored.synonyms,'off');
 assert.deepEqual(workbench.simplifiedSearchFilters({}),workbench.defaultAdvancedSearch);
 const search=workbench.savedSearchSchema.parse({name:'近畿の研修',mode:'sfl',keywords:'研修',exclude:'',source:'all',category:'all',newOnly:false,filters:restored});
 const headers={'oai-authenticated-user-id':actor.id,'oai-authenticated-user-email':actor.email,'Content-Type':'application/json'};
 const saved=await preferences.POST(new Request('https://portal.example.test/api/procurement-workbench',{method:'POST',headers,body:JSON.stringify({action:'save-search',search})}));assert.equal(saved.status,200);
 const result=await(await preferences.GET(new Request('https://portal.example.test/api/procurement-workbench',{headers}))).json();
 assert.deepEqual(result.searches.find(item=>item.name===search.name).filters,restored);
});


test('free mode enforces the same fixed qualifications and grades as all preset modes',async()=>{
 reset();
 const fixtures=[
  candidate('医療機器 A等級案件','https://example.go.jp/free/a',{contractMethod:'',descriptionText:'医療機器の購入。全省庁統一資格の「物品の販売」でA等級に格付けされている者。'}),
  candidate('医療機器 自治体案件','https://city.example.lg.jp/free/local',{contractMethod:'一般競争入札',agency:'例市',descriptionText:'医療機器の購入。本市の入札参加資格者名簿に登録されている者。'}),
  candidate('医療機器 条件未取得','https://example.go.jp/free/unknown',{contractMethod:'',descriptionText:'医療機器を購入します。'}),
  candidate('医療機器 締切未確認','https://example.go.jp/free/deadline',{contractMethod:'',descriptionText:'医療機器を購入します。',deadline:''}),
  candidate('医療機器 D等級案件','https://example.go.jp/free/d',{contractMethod:'',descriptionText:'医療機器の購入。全省庁統一資格の「物品の販売」でD等級に格付けされている者。'}),
  candidate('研修 無関係な案件','https://example.go.jp/free/unrelated'),
  candidate('医療機器 期限切れ','https://example.go.jp/free/closed',{deadline:'2000-01-01'}),
 ];
 await store.saveDiscovered(fixtures);
 const free=await store.discoveryFeed(actor,options({mode:'free',bucket:'all',keywords:['医療機器']}));
 assert.deepEqual(free.items.map(v=>v.title),['医療機器 D等級案件']);
 assert.equal(free.total,1);assert.equal(free.counts.all,1);assert.equal(free.qualificationExcluded,4);
 assert.deepEqual(free.qualificationGrades,{goodsGrade:'D',serviceGrade:'D',purchaseGrade:'C'});
 for(const mode of ['sfl','engineer','academy']){
  const fixed=await store.discoveryFeed(actor,options({mode,bucket:'all',keywords:['医療機器']}));
  assert.deepEqual(fixed.items.map(v=>v.title),['医療機器 D等級案件']);assert.equal(fixed.qualificationExcluded,4);
 }
 const unified=await store.discoveryFeed(actor,options({mode:'free',bucket:'all',keywords:['医療機器'],category:'unified-required'}));
 assert.deepEqual(unified.items.map(v=>v.title),[fixtures[4].title]);
 const checks=workbench.assessCandidate(free.items[0],workbench.emptyCompanyProfile);
 assert.match(checks[0].detail,/物品の販売：登録等級D/);
 assert.doesNotMatch(checks[0].detail,/照合は行いません/);
 assert.equal(workbench.readWorkflow(workbench.candidateToBid(free.items[0],'free').workflow).mode,'free');
});

test('free search API requires membership and explicit keywords and keeps twelve-result pagination',async()=>{
 reset();await store.saveDiscovered([
  ...Array.from({length:15},(_,i)=>candidate('医療機器 '+i,`https://example.go.jp/free/${i}`,{contractMethod:'一般競争入札',descriptionText:'医療機器の購入。全省庁統一資格の物品の販売でD等級の資格を有する者。'})),
  candidate('医療機器 対象外の等級','https://example.go.jp/free/excluded',{contractMethod:'一般競争入札',descriptionText:'医療機器の購入。全省庁統一資格の物品の販売でA等級の資格を有する者。'}),
 ]);
 assert.equal((await route.GET(new Request('https://portal.example.test/api/discovery?mode=free&keywords=医療機器'))).status,401);
 const load=async(suffix='')=>(await route.GET(new Request('https://portal.example.test/api/discovery?mode=free&keywords=医療機器'+suffix,{headers:memberHeaders}))).json();
 const first=await load(),next=await load('&offset=12');assert.equal(first.items.length,12);assert.equal(first.total,15);assert.equal(next.items.length,3);assert.equal(new Set([...first.items,...next.items].map(v=>v.id)).size,15);
 queryTrace=[];const empty=await store.discoveryFeed(actor,options({mode:'free',keywords:[]}));assert.equal(empty.total,0);assert.equal(queryTrace.length,0);queryTrace=null;
 const blank=await route.POST(req({action:'start',mode:'free',keywords:' 、 '}));assert.equal(blank.status,400);assert.match((await blank.json()).error,/入力/);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM discovery_runtime').get().n,0);
});

test('free collector sends only requested words for a fresh run and prioritizes them in an existing shared run',async()=>{
 reset();
 assert.equal((await route.POST(req({action:'start',mode:'free',keywords:'道路工事、医療機器',synonyms:'off'}))).status,200);
 let state=JSON.parse(sql.prepare('SELECT data FROM discovery_runtime').get().data);
 assert.deepEqual(state.api.flatMap(task=>task.terms),['道路工事','医療機器']);assert.ok(state.browsers.every(job=>job.mode==='free'&&job.retainUnknown));
 const calls=[];globalThis.fetch=async(url)=>{calls.push(new URL(url));return new Response('<SearchResult><TotalCount>0</TotalCount><ReturnCount>0</ReturnCount></SearchResult>',{headers:{'Content-Type':'application/xml'}})};
 try{await collector.stepCollection('manual:owner:free',state.inspection.id);}finally{globalThis.fetch=originalFetch;}
 assert.equal(calls.length,1);assert.equal(calls[0].searchParams.get('Query'),'道路工事 OR 医療機器');
 reset();await collector.startCollection();state=JSON.parse(sql.prepare('SELECT data FROM discovery_runtime').get().data);const before=state.api.length;
 await collector.startCollection(['医療機器'],'manual','all','free');state=JSON.parse(sql.prepare('SELECT data FROM discovery_runtime').get().data);
 assert.equal(state.api.length,before+1);assert.deepEqual(state.api[0].terms,['医療機器']);assert.ok(state.knownTerms.includes('研修'));
});

test('free saved searches and review history stay personal and preserve the mode',async()=>{
 reset();sql.exec('DELETE FROM saved_procurement_searches');
 const search={name:'自由な検索',mode:'free',keywords:'測量',source:'all',exclude:'',category:'all',newOnly:false,filters:workbench.advancedSearchSchema.parse({region:'東京都、滋賀県',synonyms:'off'})};
 const saved=await preferences.POST(new Request('https://portal.example.test/api/procurement-workbench',{method:'POST',headers:{...memberHeaders,'Content-Type':'application/json'},body:JSON.stringify({action:'save-search',search})}));assert.equal(saved.status,200);
 const mine=await (await preferences.GET(new Request('https://portal.example.test/api/procurement-workbench',{headers:memberHeaders}))).json();assert.equal(mine.searches.length,1);assert.equal(mine.searches[0].mode,'free');assert.equal(mine.searches[0].filters.synonyms,'off');assert.equal(mine.searches[0].filters.region,'東京都、滋賀県');
 const owner=await (await preferences.GET(new Request('https://portal.example.test/api/procurement-workbench',{headers:{'oai-authenticated-user-id':actor.id,'oai-authenticated-user-email':actor.email}}))).json();assert.equal(owner.searches.length,0);
 const notice=candidate('測量業務','https://city.example.lg.jp/free/review',{contractMethod:'',descriptionText:'測量を行う。全省庁統一資格の役務の提供等でD等級の資格を有する者。'});await store.saveDiscovered([notice]);const id=await domain.discoveryIdentity(notice);
 const response=await route.POST(new Request('https://portal.example.test/api/discovery',{method:'POST',headers:{...memberHeaders,'Content-Type':'application/json'},body:JSON.stringify({action:'review',mode:'free',id,state:'reviewed'})}));assert.equal(response.status,200);
 assert.equal((await store.discoveryFeed(accountActor,options({mode:'free',bucket:'reviewed',keywords:['測量']}))).total,1);
 assert.equal((await store.discoveryFeed(actor,options({mode:'free',bucket:'reviewed',keywords:['測量']}))).total,0);
});

test('free mode reads Lark registrations for the explicitly selected existing table',async()=>{
 reset();const notice=candidate('医療機器の購入','https://example.go.jp/free/lark');await store.saveDiscovered([notice]);
 const lark=await vite.ssrLoadModule('/lib/lark-registration.ts');const scopes=await vite.ssrLoadModule('/lib/member-lark-store.ts');
 const scope=await scopes.larkScope(actor),key=await scopes.scopedLarkKey(scope,await lark.larkRegistrationKey('engineer',notice));
 sql.prepare("INSERT INTO lark_bid_registrations (key,mode,state,client_token,record_id,warnings,created_by,updated_at,connection_scope) VALUES (?,?,?,?,?,?,?,?,?)").run(key,'engineer','registered','fixture','recFree','[]',actor.id,Date.now(),scope);
 const found=await store.discoveryFeed(actor,options({mode:'free',larkMode:'engineer',bucket:'reviewed',keywords:['医療機器']}));assert.equal(found.total,1);assert.equal(found.items[0].registered,true);
 assert.equal((await store.discoveryFeed(actor,options({mode:'free',larkMode:'academy',bucket:'reviewed',keywords:['医療機器']}))).total,0);
 assert.equal((await store.discoveryFeed(accountActor,options({mode:'free',larkMode:'engineer',bucket:'reviewed',keywords:['医療機器']}))).total,0);
 assert.deepEqual(Object.keys(lark.larkTargets),['sfl','engineer','academy']);assert.equal(lark.larkModeSchema.safeParse('free').success,true);
});


test('manual searches stop after 100 inspected notices with zero, three or twenty-seven eligible candidates',async()=>{
 for(const eligible of [0,3,27]){
  reset();let calls=0;
  // Existing matching rows must not stop a new external inspection.
  await store.saveDiscovered(Array.from({length:110},(_,i)=>candidate('Webサイト 保存済み'+i,'https://example.go.jp/old/'+i)));
  globalThis.fetch=async(raw)=>{
   const url=new URL(raw);assert.equal(url.hostname,'www.kkj.go.jp');assert.equal(url.searchParams.get('Count'),'50');
   const base=calls++*50;
   return new Response('<Results><SearchResults><SearchHits>10000</SearchHits>'+Array.from({length:50},(_,i)=>{
    const n=base+i;return `<SearchResult><ProjectName>Webサイト制作 ${n}</ProjectName><ExternalDocumentURI>https://example.go.jp/inspection/${n}</ExternalDocumentURI><OrganizationName>国の機関</OrganizationName><ProjectDescription>Webサイト制作。全省庁統一資格の物品の販売で${n<eligible?'D':'A'}等級の資格を有する者。見積書提出期限2099年9月30日。</ProjectDescription></SearchResult>`;
   }).join('')+'</SearchResults></Results>');
  };
  try{
   const start=await route.POST(req({action:'start',mode:'engineer',source:'kkj',keywords:'Webサイト',synonyms:'off'}));assert.equal(start.status,200);
   const {runId}=await start.json();assert.ok(runId);
   for(let n=1;n<=2;n++){
    sql.prepare("UPDATE discovery_runtime SET data=json_set(data,'$.nextAt',0) WHERE key=?").run('manual:owner:engineer');
    const step=await route.POST(req({action:'step',mode:'engineer',runId}));assert.equal(step.status,200);
    const {progress}=await step.json();assert.equal(progress.inspection.inspected,n*50);
    assert.equal(progress.inspection.reason,n===2?'limit':undefined);
   }
   const stopped=await route.POST(req({action:'step',mode:'engineer',runId}));assert.equal(stopped.status,200);assert.equal(calls,2,'no request after 100 notices even with no eligible candidate');
   const url='https://portal.example.test/api/discovery?'+new URLSearchParams({mode:'engineer',source:'kkj',bucket:'all',keywords:'Webサイト',runId});
   const headers={'oai-authenticated-user-id':actor.id,'oai-authenticated-user-email':actor.email};
   const results=await (await route.GET(new Request(url,{headers}))).json();
   assert.equal(results.total,eligible);assert.equal(results.items.length,Math.min(12,eligible));assert.equal(results.progress.inspection.inspected,100);
   if(eligible===27){const nextPage=await (await route.GET(new Request(url+'&offset=12',{headers}))).json();assert.equal(nextPage.items.length,12);assert.equal(new Set([...results.items,...nextPage.items].map(i=>i.id)).size,24);}
   // Another member cannot read or advance this run, and gets their own budget.
   assert.equal((await route.GET(new Request(url,{headers:memberHeaders}))).status,409);
   const own=await route.POST(new Request('https://portal.example.test/api/discovery',{method:'POST',headers:{...memberHeaders,'Content-Type':'application/json'},body:JSON.stringify({action:'start',mode:'engineer',source:'kkj',keywords:'Webサイト',synonyms:'off'})}));
   const memberRun=await own.json();assert.notEqual(memberRun.runId,runId);assert.equal(memberRun.progress.inspection.inspected,0);
   const resumed=await (await route.POST(req({action:'start',mode:'engineer',source:'kkj',keywords:'Webサイト',synonyms:'off'}))).json();
   assert.notEqual(resumed.runId,runId);assert.equal(resumed.progress.inspection.inspected,0);
   assert.equal((await route.POST(req({action:'step',mode:'engineer',runId}))).status,409,'stale requests cannot consume the next batch');
   assert.equal(calls,2,'starting the next batch itself does not launch external work');
  }finally{globalThis.fetch=originalFetch;}
 }
});

test('manual navigation without matches stops at sixty seconds without another upstream call',async()=>{
 reset();let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not fetch after deadline');};
 try{
  const {runId}=await (await route.POST(req({action:'start',source:'gsdf',keywords:'研修'}))).json();
  sql.prepare("UPDATE discovery_runtime SET data=json_set(data,'$.inspection.endsAt',?) WHERE key=?").run(Date.now()-1,'manual:owner:sfl');
  const {progress}=await (await route.POST(req({action:'step',runId}))).json();
  assert.equal(progress.inspection.reason,'time');assert.equal(progress.inspection.inspected,0);assert.equal(progress.status,'paused');assert.equal(calls,0);
  const obsolete=await route.POST(req({action:'step'}));assert.equal(obsolete.status,400,'old pages cannot restart the shared unbounded collector');
 }finally{globalThis.fetch=originalFetch;}
});

test('result loading stops at the same 100-candidate pool, keeps tabs consistent and pages by twelve',async()=>{
 reset();
 await store.saveDiscovered(Array.from({length:503},(_,i)=>candidate('Webサイト制作 '+i,'https://example.go.jp/bounded/'+i,{deadline:i%2?'2099-09-30':'',deadlineEvidence:i%2?'見積書提出期限2099年9月30日':'',descriptionText:'Webサイト制作。全省庁統一資格を有する者。'+ '案件の説明。'.repeat(800)})));
 const get=async(extra={})=>{
  const response=await route.GET(new Request('https://portal.example.test/api/discovery?'+new URLSearchParams({mode:'engineer',keywords:'Webサイト',bucket:'all',...extra}),{headers:memberHeaders}));
  assert.equal(response.status,200);return response.json();
 };
 queryTrace=[];
 try{
  const started=performance.now(),first=await get();
  assert.equal(first.total,100);assert.equal(first.counts.all,100);assert.equal(first.items.length,12);assert.equal(first.candidateLimitReached,true);
  assert.equal(queryTrace.filter(q=>q.includes('ORDER BY id LIMIT')).length,1,'do not scan all 503 saved bodies after reaching 100');
  const recommended=await get({bucket:'recommended'}),attention=await get({bucket:'attention'});
  assert.deepEqual(recommended.counts,first.counts);assert.deepEqual(attention.counts,first.counts);
  assert.equal(recommended.total+attention.total,100);
  const second=await get({offset:'12'});
  assert.equal(second.items.length,12);assert.equal(new Set([...first.items,...second.items].map(i=>i.id)).size,24);
  const expanded=await get({candidateLimit:'200'});
  assert.equal(expanded.counts.all,200);assert.equal(expanded.items.length,12);
  console.log('Bounded saved results, 503 long notices:',Math.round(performance.now()-started),'ms');
 }finally{queryTrace=null;}
});


test('the sixty-second budget aborts an in-flight request and retains its task for manual resume',async()=>{
 reset();let calls=0;globalThis.fetch=async(_url,{signal})=>{
  calls++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 };
 try{
  const {runId}=await (await route.POST(req({action:'start',source:'kkj',keywords:'研修',synonyms:'off'}))).json();
  sql.prepare("UPDATE discovery_runtime SET data=json_set(data,'$.inspection.endsAt',?) WHERE key=?").run(Date.now()+25,'manual:owner:sfl');
  const response=await route.POST(req({action:'step',runId}));assert.equal(response.status,200);
  const {progress}=await response.json();assert.equal(progress.inspection.reason,'time');assert.equal(progress.inspection.inspected,0);assert.equal(calls,1);
  const state=JSON.parse(sql.prepare('SELECT data FROM discovery_runtime WHERE key=?').get('manual:owner:sfl').data);
  assert.equal(state.api.length,1,'unfinished keyword task survives the deadline');assert.equal(state.failedApi?.length??0,0);
 }finally{globalThis.fetch=originalFetch;}
});


test('saved search preparation preserves results, timestamps and revisions while reducing body reads',async()=>{
 reset();
 const index=await vite.ssrLoadModule('/lib/discovery-search-index.ts');
 const notices=[
  candidate('AI研修','https://example.go.jp/index/1',{descriptionText:'AI training。全省庁統一資格の役務の提供等でD等級を有する者。',contractMethod:''}),
  candidate('医療機器 D','https://example.go.jp/index/2',{descriptionText:'全省庁統一資格の物品の販売でD等級を有する者。',contractMethod:''}),
  candidate('AI chair','https://example.go.jp/index/3',{descriptionText:'全省庁統一資格の役務の提供等でA等級を有する者。',contractMethod:''}),
 ];
 await store.saveDiscovered(notices);await store.setDiscoveryReview(actor,'sfl',await domain.discoveryIdentity(notices[0]),'reviewed','');
 // Simulate pre-migration records; source data and fingerprints stay authoritative.
 sql.exec("UPDATE discovery_candidates SET search_version=0,search_data=''");
 const query=options({mode:'sfl',keywords:['AI','医療機器'],bucket:'all',pageSize:12});
 const before=await store.discoveryFeed(actor,query);
 const original=sql.prepare('SELECT id,data,first_seen,last_seen,changed_at,fingerprint FROM discovery_candidates ORDER BY id').all();
 assert.deepEqual(await index.prepareSearchBatch(2),{prepared:2,remaining:true});
 assert.deepEqual(await store.discoveryFeed(actor,query),before,'mixed prepared and legacy records are equivalent');
 assert.deepEqual(await index.prepareSearchBatch(2),{prepared:1,remaining:false});
 assert.deepEqual(await store.discoveryFeed(actor,query),before);
 assert.deepEqual(sql.prepare('SELECT id,data,first_seen,last_seen,changed_at,fingerprint FROM discovery_candidates ORDER BY id').all(),original);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM discovery_revisions').get().n,0);
 assert.deepEqual(await index.prepareSearchBatch(2),{prepared:0,remaining:false});
 await store.saveDiscovered([{...notices[0],retrievalIssue:'一時的な取得エラー'}]);
 assert.equal((await store.discoveryFeed(actor,query)).counts.attention,1,'failed refresh updates prepared review state');
});

test('benchmark: twelve cards from 12000 saved notices, before and after search preparation',async(t)=>{
 reset();const index=await vite.ssrLoadModule('/lib/discovery-search-index.ts');
 const insert=sql.prepare('INSERT INTO discovery_candidates(id,data,first_seen,last_seen,changed_at,fingerprint,deadline) VALUES(?,?,?,?,?,?,?)');
 const longBody='業務の実施日程、納品場所、数量および提出書類の詳細は仕様書の記載に従う。'.repeat(50);
 sql.exec('BEGIN');
 for(let i=0;i<12000;i++){
  const item=candidate(i%23===0?'DX研修 '+i:'備品の調達 '+i,'https://example.go.jp/performance/'+i,{id:String(i).padStart(8,'0'),descriptionText:longBody});
  insert.run(item.id,JSON.stringify({...item,searchable:domain.norm(item.title+' '+item.descriptionText)}),1000,1000,1000,'version-'+i,item.deadline);
 }
 sql.exec('COMMIT');
 const query=options({mode:'sfl',keywords:['DX'],bucket:'all',pageSize:12,candidateLimit:100});
 const measure=async()=>{readBytes=0;const start=performance.now(),result=await store.discoveryFeed(actor,query),ms=performance.now()-start,bytes=readBytes;readBytes=null;return {result,ms,bytes};};
 const before=await measure();
 while((await index.prepareSearchBatch(100)).remaining){}
 const after=await measure();
 assert.deepEqual(after.result,before.result);assert.equal(after.result.items.length,12);assert.equal(after.result.total,100);
 assert.ok(after.bytes<before.bytes/3,'prepared lookup does not transfer hundreds of full bodies');
 queryTrace=[];const response=await route.GET(new Request('https://portal.example.test/api/discovery?mode=sfl&keywords=DX&bucket=all',{headers:memberHeaders}));
 assert.equal(response.status,200);assert.match(response.headers.get('Server-Timing'),/saved-search;dur=/);
 assert.ok(queryTrace.every(q=>!q.includes('discovery_runtime')),'saved lookup never reads an external fetch queue');queryTrace=null;
 t.diagnostic(JSON.stringify({fixtureNotices:12000,returnedCards:12,candidates:100,beforeMs:+before.ms.toFixed(1),preparedMs:+after.ms.toFixed(1),beforeReadBytes:before.bytes,preparedReadBytes:after.bytes,scope:'local SQLite; excludes production network and browser paint'}));
});


test('municipal upgrade retains registration-required notices across index migration and local grouping',async()=>{
 reset();
 const local=candidate('ペットのマッチングシステム構築','https://www.city.toyonaka.osaka.jp/example',{agency:'豊中市',contractMethod:'公募型プロポーザル',descriptionText:'本市の入札参加資格者名簿に登録されている者。近畿圏に営業所を有すること。自治体における類似業務実績を有すること。再委託には事前承諾が必要。'});
 await store.saveDiscovered([local,candidate('マッチングシステム構築 国','https://example.go.jp/matching')]);
 const q=options({keywords:['マッチングシステム'],bucket:'all',includePool:true});
 const before=await store.discoveryFeed(actor,q);assert.equal(before.total,2);assert.equal(before.counts.attention,1);
 const group=domain.groupDiscoveryFeed(before,'municipal','all',0);assert.equal(group.total,1);assert.equal(group.items[0].agency,'豊中市');
 const detail=before.items.find(v=>v.agency==='豊中市');
 const checks=workbench.assessCandidate(detail,workbench.emptyCompanyProfile);assert.ok(checks.find(v=>v.label==='法人としての類似実績').evidence);assert.ok(checks.find(v=>v.label==='再委託・実施体制').evidence);assert.ok(checks.every(v=>v.state!=='match'));
 sql.exec('UPDATE discovery_candidates SET search_version=1');
 const fallback=await store.discoveryFeed(actor,q);assert.equal(fallback.total,2);assert.equal(fallback.counts.attention,1);
 const index=await vite.ssrLoadModule('/lib/discovery-search-index.ts');await index.prepareSavedSearch();
 const prepared=await store.discoveryFeed(actor,{...q,category:'municipal'});assert.equal(prepared.total,1);assert.equal(prepared.items[0].agency,'豊中市');
 await store.setDiscoveryReview(actor,'engineer',detail.id,'reviewed','条件を原文確認');
 const reviewed=await store.discoveryFeed(actor,{...q,category:'municipal',bucket:'reviewed'});assert.equal(reviewed.total,1);
 const invalid=await route.GET(new Request('https://portal.example.test/api/discovery?mode=engineer&category=municipal&keywords=マッチングシステム',{headers:memberHeaders}));assert.equal(invalid.status,200);
});
