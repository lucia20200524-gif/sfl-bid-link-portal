import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root=fileURLToPath(new URL('..',import.meta.url));
const sql=new DatabaseSync(':memory:');
for(const statement of readFileSync(new URL('../drizzle/0002_worthless_shooting_star.sql',import.meta.url),'utf8').split('--> statement-breakpoint'))sql.exec(statement);
// Exercise the production SQL, including leases and ownership, against SQLite.
globalThis.browserTestDB={prepare(query){return {bind(...values){const prepared=sql.prepare(query);return {async first(){return prepared.get(...values)??null;},async run(){return prepared.run(...values);}};}};}};
globalThis.browserTestEnv={};
const vite=await createServer({configFile:false,appType:'custom',root,resolve:{alias:[
{find:'@/lib/member-auth',replacement:'\0browser-test-auth'},
{find:'@/lib/server-store',replacement:'\0browser-test-store'},
{find:/^\.\/server-store$/,replacement:'\0browser-test-store'},
{find:'cloudflare:workers',replacement:'\0browser-test-env'},{find:'@',replacement:root}]},
plugins:[{name:'browser-tests',resolveId(id){if(id.startsWith('\0browser-test-'))return id;},load(id){
if(id==='\0browser-test-auth')return `export const requireSearchMember=async r=>({id:r.headers.get('test-user')||'account:fixture'});`;
if(id==='\0browser-test-env')return 'export const env=globalThis.browserTestEnv;';
if(id==='\0browser-test-store')return `export const db=()=>globalThis.browserTestDB;
export class ApiError extends Error{constructor(status,message,code=''){super(message);this.status=status;this.code=code;}}
export const requireMember=async r=>({id:r.headers.get('test-user')||'guest:fixture'});
export const checkMutation=()=>{};export const jsonBody=r=>r.json();export const reply=(data,status=200)=>Response.json(data,{status});export const failure=e=>reply({error:e.message,code:e.code},e.status??500);`;
}}],server:{middlewareMode:true,hmr:false}});
after(async()=>{await vite.close();sql.close();delete globalThis.browserTestDB;delete globalThis.browserTestEnv;});
const parser=await vite.ssrLoadModule('/lib/defense-browser-parser.ts');
const engine=await vite.ssrLoadModule('/lib/defense-browser-engine.ts');
const rules=await vite.ssrLoadModule('/lib/defense-browser-rules.ts');
const catalog=await vite.ssrLoadModule('/lib/gsdf-procurement-catalog.ts');
const msdfCatalog=await vite.ssrLoadModule('/lib/msdf-procurement-catalog.ts');
const asdfCatalog=await vite.ssrLoadModule('/lib/asdf-procurement-catalog.ts');
const msdfPdf=await vite.ssrLoadModule('/lib/msdf-pdf-list.ts');
const store=await vite.ssrLoadModule('/lib/defense-browser-store.ts');
const client=await vite.ssrLoadModule('/lib/defense-browser-client.ts');
const now=new Date('2026-09-11T05:00:00Z');
const page=body=>`<!doctype html><html><head><title>公式調達情報</title></head><body>${body}</body></html>`;
test('ASDF mixed sections keep bids separate from OC, ignore results/forms and preserve explicit submission dates',()=>{
 const url='https://www.mod.go.jp/asdf/fixture/list.html';
 const html=page(`<table><tr><td><h2>入札公告</h2><table><tr><th>件名（ファイル名）</th><th>入札日時</th><th>納期</th><th>備考</th></tr><tr><td><a href="bid.pdf">広報動画制作</a></td><td>令和8年10月9日</td><td>令和9年3月31日</td><td><a href="form.pdf">入札書</a><a href="market.pdf">市場価格調査書</a></td></tr></table>
 <h2>オープンカウンター方式</h2><table><tr><th>件名(File name)</th><th>見積書提出期限</th><th>納期</th><th>結果</th></tr><tr><td><a href="oc.pdf">電話機台</a></td><td>R8.9.18</td><td>R9.1.29</td><td><a href="result.pdf">○</a></td></tr></table>
 <p>オープンカウンター方式による見積依頼の結果</p><table><tr><th>件名</th><th>公表掲載年月日</th></tr><tr><td><a href="award.pdf">受水槽等清掃</a></td><td>8/27</td></tr></table></td></tr></table>`);
 const parsed=parser.parseOfficialHtml(html,url,'asdf');
 assert.deepEqual(parsed.links.map(l=>l.url),['https://www.mod.go.jp/asdf/fixture/bid.pdf','https://www.mod.go.jp/asdf/fixture/oc.pdf']);
 assert.doesNotMatch(parsed.links[0].listingEvidence.text,/オープンカウンター/);
 assert.equal(parsed.links[0].listingEvidence.deadline,undefined);
 assert.match(parsed.links[1].listingEvidence.text,/オープンカウンター/);
 assert.equal(parsed.links[1].listingEvidence.deadline.date,'2026-09-18');
});
test('ASDF heading variants retain notice names and skip result-column PDFs',()=>{
 for(const heading of ['公告内容','品名(件名)及び概要','件　名（品　名）']){
  const html=page(`<h2>入札情報</h2><table><tr><th>${heading}</th><th>公告等</th><th>入札結果</th></tr><tr><td>研修運営</td><td><a href="notice.pdf">○</a></td><td><a href="award.pdf">○</a></td></tr></table>`);
  const links=parser.parseOfficialHtml(html,'https://www.mod.go.jp/asdf/fixture/','asdf').links;
  assert.equal(links.length,1);assert.equal(links[0].title,'研修運営');assert.ok(links[0].url.endsWith('/notice.pdf'));
 }
});
test('ASDF verified catalog upgrades all 28 targets and preserves denied URLs and pauses',()=>{
 const job=engine.newBrowserJob('sfl','asdf',['広報'],'fulltext',now);
 const denied='https://www.mod.go.jp/asdf/2dep/jyujyo/mpd/';
 job.queue=[];job.status='paused';job.visited=12;job.pageIssues=[{url:denied,title:'十条基地',target:7,message:'HTTP 403',status:403}];
 assert.equal(engine.addAsdfCatalog(job),true);assert.equal(job.status,'paused');assert.equal(job.visited,12);
 assert.deepEqual(job.targets.map(t=>t.name),asdfCatalog.asdfProcurementCatalog.map(t=>t.name));
 assert.equal(job.targets.length,28);assert.equal(job.queue.some(p=>p.url===denied),false);
 assert.ok(job.targets.every((_,i)=>i===7||job.queue.some(p=>p.target===i)));
 assert.ok(job.queue.some(p=>p.url.endsWith('/matsushima/tyotatu/open/index.html')));
 assert.equal(engine.addAsdfCatalog(job),false);
});
test('ASDF PDF indexes follow published original links without creating a combined fictitious notice',async()=>{
 const job=engine.newBrowserJob('sfl','asdf',['研修'],'fulltext',now);job.retainUnknown=true;
 const url=asdfCatalog.asdfProcurementCatalog.find(e=>e.name==='芦屋基地').listingUrls[1];
 job.queue=[{url,target:24,depth:1,kind:'navigation',title:'オープンカウンター',agency:'芦屋基地'}];
 const notice='https://www.mod.go.jp/asdf/ashiya/fixture.pdf';
 const transport={html:async()=>{throw Error('unexpected');},pdfListing:async()=>({text:'一覧には複数の案件と納期が掲載されています。',links:[{url:notice,title:'研修の委託'},{url:'https://evil.test/x.pdf',title:'外部リンク'}]}),pdf:async()=> '研修の委託。全省庁統一資格を有する者。見積書提出期限：令和8年9月30日。'};
 await engine.advanceBrowserJob(job,transport,now);assert.equal(job.items.length,0);assert.equal(job.queue.length,1);
 await engine.advanceBrowserJob(job,transport,now);assert.equal(job.items.length,1);assert.equal(job.items[0].sourceUrl,url);assert.equal(job.items[0].officialUrl,notice);assert.equal(job.items[0].deadline,'2026-09-30');
 assert.equal(engine.browserJobView(job).progress.targets[24].state,'partial');
});
test('empty official responses report unreadable content instead of a parser crash',()=>{
 for(const html of ['', '   ', '<!-- unavailable -->'])assert.throws(()=>parser.parseOfficialHtml(html,'https://www.mod.go.jp/gsdf/fixture.html','gsdf'),error=>!(error instanceof TypeError)&&error.message==='ページの本文を確認できませんでした。');
});
test('official base URLs and frames resolve published links without inventing paths',()=>{
 const url='https://www.mod.go.jp/gsdf/frame-fixture/fin/keiyaku.htm';
 const parsed=parser.parseOfficialHtml('<html><head><base href="./current/"></head><frameset><frame src="list.html"><frame src="https://evil.test/secret"></frameset></html>',url,'gsdf');
 assert.deepEqual(parsed.links.map(link=>link.url),['https://www.mod.go.jp/gsdf/frame-fixture/fin/current/list.html']);
 const notice=parser.parseOfficialHtml('<html><head><base href="./current/"></head><body><h1>令和8年度の調達情報と公告一覧です</h1><a href="notice.pdf">清掃業務</a></body></html>',url,'gsdf');
 assert.equal(notice.links[0].url,'https://www.mod.go.jp/gsdf/frame-fixture/fin/current/notice.pdf');
 assert.throws(()=>parser.parseOfficialHtml('<html><head><base href="https://evil.test/"></head><body>公開調達情報の掲載ページです。<a href="notice.pdf">公告</a></body></html>',url,'gsdf'),/基準/);
});
test('403 records the denied page once while other targets continue; 429 still pauses',async()=>{
 const job=engine.newBrowserJob('sfl','gsdf',['Webサイト'],'fulltext',now);
 const denied='https://www.mod.go.jp/gsdf/denied/list.html',allowed='https://www.mod.go.jp/gsdf/allowed/list.html';
 job.queue=[{url:denied,target:0,depth:1,kind:'navigation'},{url:allowed,target:1,depth:1,kind:'navigation'}];
 const calls=[];const transport={html:async url=>{calls.push(url);if(url===denied)throw new client.BrowserFetchError('自動取得の拒否（403）',false,403);return {url,html:table()};},pdf:async()=>''};
 await engine.advanceBrowserJob(job,transport,now);
 assert.equal(job.status,'running');assert.equal(job.pageIssues[0].status,403);assert.equal(job.targets[0].errors,1);
 await engine.advanceBrowserJob(job,transport,now);
 assert.equal(job.items.length,1);assert.deepEqual(calls,[denied,allowed]);assert.equal(job.status,'completed');
 const rate=engine.newBrowserJob('sfl','gsdf',[],'fulltext',now);
 await engine.advanceBrowserJob(rate,{...transport,html:async()=>{throw new client.BrowserFetchError('利用制限',true,429);}},now);
 assert.equal(rate.status,'paused');assert.equal(rate.visited,0);assert.equal(rate.queue.length,1);
});
test('404 recovery rechecks only the published parent, verifies a changed link and never retries the broken URL',async()=>{
 const job=engine.newBrowserJob('sfl','gsdf',['Webサイト'],'fulltext',now);
 const parent='https://www.mod.go.jp/gsdf/unit/list.html',old='https://www.mod.go.jp/gsdf/unit/old.pdf',updated='https://www.mod.go.jp/gsdf/unit/current.pdf';
 job.queue=[{url:old,target:0,depth:2,kind:'notice',title:'Webサイト制作',parentUrl:parent}];
 const calls=[];const transport={html:async(url,options)=>{calls.push(url);assert.equal(options.refresh,true);return {url,html:page('<p>公式の調達公告一覧をご案内します。</p><a href="current.pdf">Webサイト制作</a>')};},pdf:async url=>{calls.push(url);if(url===old)throw new client.BrowserFetchError('リンク切れ（404）',false,404);return 'Webサイト制作。見積書提出期限：2026年9月25日。';}};
 for(let n=0;job.status==='running'&&n<5;n++)await engine.advanceBrowserJob(job,transport,now);
 assert.deepEqual(calls,[old,parent,updated]);assert.equal(job.items[0].officialUrl,updated);assert.equal(job.pageIssues[0].resolvedUrl,updated);assert.equal(job.targets[0].errors,0);
});
test('404 with an unchanged link stays visibly unconfirmed without repeated fetching',async()=>{
 const job=engine.newBrowserJob('sfl','gsdf',[],'fulltext',now),parent='https://www.mod.go.jp/gsdf/unit/list.html',old='https://www.mod.go.jp/gsdf/unit/old.pdf';
 job.queue=[{url:old,target:0,depth:2,kind:'notice',title:'清掃業務',parentUrl:parent}];
 let calls=0;const transport={html:async url=>{calls++;return {url,html:page('<p>公式の調達公告一覧をご案内します。</p><a href="old.pdf">清掃業務</a>')};},pdf:async()=>{calls++;throw new client.BrowserFetchError('リンク切れ（404）',false,404);}};
 for(let n=0;job.status==='running'&&n<5;n++)await engine.advanceBrowserJob(job,transport,now);
 assert.equal(calls,2);assert.equal(job.targets[0].errors,1);assert.equal(job.pageIssues[0].resolvedUrl,undefined);assert.equal(job.items.length,0);
});
test('old paused 403 jobs continue beyond the denied URL without retrying it or resuming other pause reasons',()=>{
 const job=engine.newBrowserJob('sfl','asdf',[],'fulltext',now);
 job.status='paused';job.message='公式ページを取得できませんでした（HTTP 403）。';
 job.queue=[{url:'https://www.mod.go.jp/asdf/denied/',target:0,depth:1,kind:'navigation'},{url:'https://www.mod.go.jp/asdf/allowed/',target:1,depth:1,kind:'navigation'}];
 assert.equal(engine.resumePastDeniedPage(job,now),true);assert.equal(job.status,'running');assert.equal(job.queue.length,1);assert.equal(job.pageIssues[0].status,403);
 assert.equal(engine.resumePastDeniedPage(job,now),false);
 for(const message of ['robots.txtを確認できないため停止（HTTP 403）','ブラウザー検索の認証・権限を確認してください。','公式ページを取得できませんでした（HTTP 429）。','ユーザーが停止しました。']){
  job.status='paused';job.message=message;assert.equal(engine.resumePastDeniedPage(job,now),false);assert.equal(job.queue.length,1);
 }
});
const table=(name='Webサイト制作',deadline='8.9.25')=>page(`<h1>令和８年９月１１日現在</h1><table><tr><th>件名</th><th>参加申込書提出期限</th><th>見積書提出期限</th><th>納期</th></tr><tr><td>${name}</td><td>8.9.15</td><td>${deadline}</td><td>9.3.31</td></tr></table>`);

test('official allowlist rejects external, credential-bearing, insecure and executable URLs',()=>{
 for(const url of ['http://www.mod.go.jp/gsdf/a','https://www.mod.go.jp.evil.test/gsdf/a','https://user:secret@www.mod.go.jp/gsdf/a','https://www.mod.go.jp:444/gsdf/a','https://www.mod.go.jp/j/a','https://www.mod.go.jp/gsdf/x.zip','javascript:alert(1)','http://127.0.0.1/'])assert.equal(parser.officialDefenseUrl(url),undefined,url);
 assert.equal(parser.officialDefenseUrl('../notice.pdf#top','https://www.mod.go.jp/asdf/base/list/'),'https://www.mod.go.jp/asdf/base/notice.pdf');
});
test('table extraction uses quote submission, never participation, bidding time or delivery',()=>{
 const result=parser.parseOfficialHtml(table(),'https://www.mod.go.jp/msdf/list.html','msdf');
 assert.equal(result.notices[0].deadline.date,'2026-09-25');
 for(const heading of ['参加申込書提出期限','同等品承認申請書提出期限','入札日時','開札日','履行期限'])assert.equal(parser.tableDeadline(heading,'2026/9/25',''),undefined);
 assert.equal(parser.tableDeadline('見積書提出期限','8.9.25',''),undefined,'era may not be guessed from current year');
 assert.equal(parser.tableDeadline('見積書提出期限','8.9.25','令和8年度 令和7年度'),undefined);
 assert.equal(parser.tableDeadline('見積書提出期限','2026/2/30',''),undefined);
 assert.equal(parser.tableDeadline('見積書提出期限','8.9.11〜8.9.25','令和8年度'),undefined);
});
test('spanned table cells do not shift delivery dates into deadline columns',()=>{
 const html=page('<p>令和8年度</p><table><tr><th>件名</th><th>見積書提出期限</th><th>納期</th></tr><tr><td rowspan="2">Webサイト制作</td><td>8.9.25</td><td>9.3.31</td></tr><tr><td>8.9.26</td><td>9.3.31</td></tr></table>');
 const p=parser.parseOfficialHtml(html,'https://www.mod.go.jp/asdf/list.html','asdf');
 assert.deepEqual(p.notices.map(n=>n.deadline.date),['2026-09-25','2026-09-26']);
});
test('all nine audience / branch combinations discover every specified target and show real parsed candidates',async()=>{
 for(const mode of ['sfl','engineer','academy'])for(const source of ['gsdf','msdf','asdf']){
  const job=engine.newBrowserJob(mode,source,['Webサイト制作'],'fulltext',now);
  const rootHtml=page(rules.defenseBrowserRules[source].targets.map((name,i)=>`<a href="https://www.mod.go.jp/${source}/unit${i}/list.html">${name}</a>`).join(''));
  const calls=[];
  const transport={html:async url=>{calls.push(url);return {url,html:url===rules.defenseBrowserRules[source].entryUrl?rootHtml:table()};},pdf:async url=>{calls.push(url);return 'この一覧PDFの案件本文は未確認です。';}};
  for(let step=0;job.status==='running'&&step<300;step++)await engine.advanceBrowserJob(job,transport,now);
  assert.equal(job.status,'completed');assert.equal(job.targets.every(t=>t.visited>=1&&!t.missing),true);
  assert.equal(calls.length,rules.defenseBrowserRules[source].targets.length+1+(source==='gsdf'?catalog.gsdfProcurementCatalog.reduce((n,t)=>n+new Set([t.entryUrl,...t.listingUrls]).size,0):source==='msdf'?msdfCatalog.msdfProcurementCatalog.reduce((n,t)=>n+new Set([t.entryUrl,...t.listingUrls]).size,0):asdfCatalog.asdfProcurementCatalog.reduce((n,t)=>n+new Set([t.entryUrl,...t.listingUrls]).size,0)));
  const view=engine.browserJobView(job);assert.equal(view.result.items.length,job.targets.length);
  assert.equal(view.result.method,'official-browser');assert.equal(view.result.search.sourceId,source);
  assert.equal(view.result.items.every(i=>i.deadline==='2026-09-25'),true);
 }
});
test('errors and missing targets remain visible, without an API fallback or success-zero',async()=>{
 const job=engine.newBrowserJob('academy','asdf',['清掃'],'fulltext',now);
 const denied=[];const transport={html:async url=>{denied.push(url);return {url,html:page('<h1>セキュリティ検証の実行</h1>アクセスを確認しています。')};},pdf:async()=>{throw new Error('資料を取得できませんでした');}};
 for(let i=0;job.status==='running'&&i<300;i++)await engine.advanceBrowserJob(job,transport,now);
 assert.equal(new Set(denied).size,denied.length,'denied URLs are not retried');
 assert.equal(job.status,'completed');assert.equal(job.items.length,0);
 assert.equal(engine.browserJobView(job).progress.targets.every(t=>t.state==='failed'),true);
 assert.match(job.message,/未確認/);
});
test('HTML notice links and attached PDFs are followed, OR matches and deadline exclusions apply',async()=>{
 const job=engine.newBrowserJob('engineer','gsdf',['Webサイト','清掃'],'fulltext',now);
 job.queue=[{url:'https://www.mod.go.jp/gsdf/unit/list.html',target:0,depth:1,kind:'navigation'}];
 const html=page('<ul><li><a href="future.pdf">清掃業務 公告</a></li><li><a href="today.pdf">Webサイト 公告</a></li><li><a href="unknown.pdf">Webサイト 公告</a></li><li><a href="detail.html">Webサイト制作業務</a></li></ul>');
 const transport={html:async url=>({url,html:url.endsWith('detail.html')?page('Webサイト制作業務。見積書提出期限：2026年10月1日。'):html}),pdf:async url=>url.endsWith('future.pdf')?'清掃業務。見積書提出期限：令和8年9月25日。全省庁統一資格を有する者。':url.endsWith('today.pdf')?'Webサイト。見積書提出期限：2026年9月11日。':'Webサイト。入札日時：2026年9月25日。'};
 for(let n=0;job.status==='running'&&n<20;n++)await engine.advanceBrowserJob(job,transport,now);
 assert.equal(job.items.length,2);assert.deepEqual(job.items.map(i=>i.deadline),['2026-09-25','2026-10-01']);
 assert.equal(job.deadlineStats.closed,1);assert.equal(job.deadlineStats.unknown,1);
});
test('serialization, pause, date rollover and limits retain truthful resumable state',async()=>{
 let job=engine.newBrowserJob('sfl','gsdf',['研修'],'fulltext',now);
 const transport={html:async()=>{const e=new Error('利用上限');e.pause=true;throw e;},pdf:async()=>''};
 await engine.advanceBrowserJob(job,transport,now);assert.equal(job.status,'paused');assert.equal(job.queue.length,1);assert.equal(job.visited,0);
 job=JSON.parse(JSON.stringify(job));job.status='running';
 await engine.advanceBrowserJob(job,transport,new Date('2026-09-12T05:00:00Z'));assert.equal(job.status,'cancelled');
 job=engine.newBrowserJob('sfl','gsdf',['研修'],'fulltext',now);job.visited=(await vite.ssrLoadModule('/lib/defense-browser-types.ts')).browserLimits.pages;
 await engine.advanceBrowserJob(job,{html:async()=>{throw Error('must not request');},pdf:async()=>''},now);
 assert.equal(job.limited,true);assert.equal(job.status,'completed');
});
test('SQLite persistence enforces owner isolation, atomic lease and stale-writer cancellation',async()=>{
 const actor={id:'owner1'},other={id:'other'};
 const job=engine.newBrowserJob('sfl','gsdf',['研修'],'fulltext',now);await store.saveNewBrowserJob(actor,job);
 assert.equal((await store.latestBrowserJob(actor,'sfl','gsdf')).id,job.id);
 assert.equal(await store.latestBrowserJob(other,'sfl','gsdf'),null);
 await assert.rejects(()=>store.getBrowserJob(other,job.id),e=>e.status===404);
 const first=await store.claimBrowserJob(actor,job.id);assert.ok(first);assert.equal(await store.claimBrowserJob(actor,job.id),null);
 await store.cancelBrowserJob(actor,job.id,true);
 assert.equal(await store.commitBrowserJob(actor,first.job,first.token),false);
 assert.equal((await store.getBrowserJob(actor,job.id)).status,'paused');
 const next=await store.claimBrowserJob(actor,job.id);next.job.status='running';await store.commitBrowserJob(actor,next.job,next.token);
 assert.equal((await store.getBrowserJob(actor,job.id)).status,'running');
 const replacement=engine.newBrowserJob('sfl','gsdf',['清掃'],'title',now);await store.saveNewBrowserJob(actor,replacement);
 await assert.rejects(()=>store.getBrowserJob(actor,job.id),e=>e.status===404);
 assert.equal((await store.latestBrowserJob(actor,'sfl','gsdf')).keywords[0],'清掃');
});
test('unconfigured routes report their status to authorized members without external fetch',async()=>{
 const {GET,POST}=await vite.ssrLoadModule('/app/api/browser-search/route.ts');
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('no network');};
 try{
  assert.equal((await GET(new Request('https://app.test/api/browser-search'))).status,200);
  const response=await POST(new Request('https://app.test/api/browser-search',{method:'POST',headers:{'test-user':'member','content-type':'application/json'},body:JSON.stringify({action:'start',mode:'sfl',sourceId:'gsdf',keywords:'清掃',scope:'fulltext'})}));
  assert.equal(response.status,503);assert.equal((await response.json()).code,'browser_not_connected');assert.equal(calls,0);
 }finally{globalThis.fetch=old;}
});
test('Browser Run uses server-only credentials, validates final URL, pauses on rate limits',async()=>{
 Object.assign(globalThis.browserTestEnv,{CLOUDFLARE_BROWSER_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_BROWSER_API_TOKEN:'fixture-token-not-real'});
 const old=globalThis.fetch;const url='https://www.mod.go.jp/gsdf/test.html';
 try{
  globalThis.fetch=async(endpoint,init)=>{assert.match(endpoint,/api.cloudflare.com.*browser-rendering\/content$/);assert.equal(init.headers.Authorization,'Bearer fixture-token-not-real');const body=JSON.parse(init.body);assert.equal(body.url,url);assert.equal(body.gotoOptions.waitUntil,'networkidle2');assert.equal(body.cookies,undefined);return Response.json({success:true,result:page('公式公告の公開情報です。'),meta:{finalUrl:url,status:200}});};
  assert.equal((await client.fetchBrowserHtml(url)).url,url);
  globalThis.fetch=async()=>Response.json({success:true,result:'secret',meta:{finalUrl:'https://evil.test/',status:200}});
  await assert.rejects(()=>client.fetchBrowserHtml(url),/移動先/);
  globalThis.fetch=async()=>new Response('',{status:429});
  await assert.rejects(()=>client.fetchBrowserHtml(url),e=>e.pause===true);
 }finally{globalThis.fetch=old;delete globalThis.browserTestEnv.CLOUDFLARE_BROWSER_API_TOKEN;delete globalThis.browserTestEnv.CLOUDFLARE_BROWSER_ACCOUNT_ID;}
});
test('bounded streams cancel oversized data',async()=>{
 let cancelled=false;const response=new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024));},cancel(){cancelled=true;}}));
 await assert.rejects(()=>client.boundedBytes(response,100),/大きすぎ/);assert.equal(cancelled,true);
});

test('configured route persists start, steps, reload and pause through the production job store',async()=>{
 const {GET,POST}=await vite.ssrLoadModule('/app/api/browser-search/route.ts');
 Object.assign(globalThis.browserTestEnv,{CLOUDFLARE_BROWSER_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_BROWSER_API_TOKEN:'fixture-token-not-real'});
 const old=globalThis.fetch;
 const action=body=>POST(new Request('https://app.test/api/browser-search',{method:'POST',headers:{'test-user':'route-member','content-type':'application/json'},body:JSON.stringify(body)}));
 try{
  globalThis.fetch=async(endpoint,init)=>{const url=JSON.parse(init.body).url;return Response.json({success:true,result:page('<h1>航空自衛隊基地等契約機関（28機関）</h1><a href="https://www.mod.go.jp/asdf/chitose/list.html">千歳基地<img alt="外部リンク"></a>'),meta:{status:200,finalUrl:url}});};
  const started=await (await action({action:'start',mode:'academy',sourceId:'asdf',keywords:'清掃',scope:'fulltext'})).json();
  const id=started.progress.id;assert.ok(id);
  const advanced=await (await action({action:'step',id})).json();assert.equal(advanced.progress.visited,1);assert.equal(advanced.progress.queued,1+asdfCatalog.asdfProcurementCatalog.reduce((n,t)=>n+new Set([t.entryUrl,...t.listingUrls]).size,0));
  const response=await GET(new Request('https://app.test/api/browser-search?mode=academy&sourceId=asdf',{headers:{'test-user':'route-member'}}));
  const reloaded=await response.json();assert.equal(reloaded.job.progress.id,id);assert.equal(reloaded.job.progress.visited,1);
  const paused=await (await action({action:'pause',id})).json();assert.equal(paused.progress.status,'paused');
 }finally{globalThis.fetch=old;delete globalThis.browserTestEnv.CLOUDFLARE_BROWSER_API_TOKEN;delete globalThis.browserTestEnv.CLOUDFLARE_BROWSER_ACCOUNT_ID;}
});

test('actual PDF listing extractor follows official first-page links and excludes external and archive links',async()=>{
 const stream='BT /F1 12 Tf 50 700 Td (Training services and notice details) Tj ET';
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 8 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [6 0 R 7 0 R] >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Annot /Subtype /Link /Rect [50 695 400 715] /A << /S /URI /URI (https://www.mod.go.jp/asdf/ashiya/notice.pdf) >> >>',
  '<< /Type /Annot /Subtype /Link /Rect [50 695 400 715] /A << /S /URI /URI (https://evil.test/private.pdf) >> >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [9 0 R] >>',
  '<< /Type /Annot /Subtype /Link /Rect [50 695 400 715] /A << /S /URI /URI (https://www.mod.go.jp/asdf/ashiya/award.pdf) >> >>',
 ];
 let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 const old=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response(pdf,{headers:{'content-type':'application/pdf'}});
  const listing=await client.fetchOfficialPdfListing('https://www.mod.go.jp/asdf/ashiya/index.pdf');
  assert.deepEqual(listing.links,[{url:'https://www.mod.go.jp/asdf/ashiya/notice.pdf',title:'Training services and notice details'}]);
 }finally{globalThis.fetch=old;}
});
test('actual PDF text extractor reads a bounded PDF and rejects redirected external files',async()=>{
 const text='Web site procurement notice for browser extraction test.';
 const stream=`BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=pdf.length;pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(pdf,{headers:{'content-type':'application/pdf'}});
  assert.match(await client.fetchOfficialPdf('https://www.mod.go.jp/asdf/notice.pdf'),/Web site procurement/);
  let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://evil.test/file.pdf'}});};
  await assert.rejects(()=>client.fetchOfficialPdf('https://www.mod.go.jp/asdf/notice.pdf'),/指定先以外/);assert.equal(calls,1);
 }finally{globalThis.fetch=old;}
});

test('persistent collection retains expired notices and records target attempt/success separately',async()=>{
 const job=engine.newBrowserJob('sfl','gsdf',['Webサイト'],'fulltext',now);job.retainUnknown=true;
 job.queue=[{url:'https://www.mod.go.jp/gsdf/unit/notice.pdf',target:0,depth:2,kind:'notice',title:'Webサイト制作'}];
 await engine.advanceBrowserJob(job,{pdf:async()=> 'Webサイト制作。見積書提出期限：2020年9月1日。',html:async()=>{throw Error('unexpected')}},now);
 assert.equal(job.items.length,1);assert.equal(job.items[0].deadline,'2020-09-01');assert.equal(job.deadlineStats.closed,1);assert.equal(job.deadlineStats.future,0);
 assert.equal(job.targets[0].lastAttemptAt,now.getTime());assert.equal(job.targets[0].lastSuccessAt,now.getTime());
});
test('failed notice fetch has retrieval metadata without storing the error as notice content',async()=>{
 const job=engine.newBrowserJob('sfl','gsdf',['Webサイト'],'fulltext',now);job.retainUnknown=true;
 job.queue=[{url:'https://www.mod.go.jp/gsdf/unit/notice.pdf',target:0,depth:2,kind:'notice',title:'Webサイト制作'}];
 await engine.advanceBrowserJob(job,{pdf:async()=>{throw Error('fixture failure')},html:async()=>{throw Error('unexpected')}},now);
 assert.equal(job.items[0].summary,'');assert.match(job.items[0].retrievalIssue.message,/fixture failure/);assert.equal(job.targets[0].lastSuccessAt,undefined);
});


test('GSDF catalog independently queues all 16 selected official targets even when the root omits links',async()=>{
 const job=engine.newBrowserJob('sfl','gsdf',['広報'],'fulltext',now);
 await engine.advanceBrowserJob(job,{html:async url=>({url,html:page('<p>調達情報の掲載場所は各部隊の案内をご確認ください。</p>')}),pdf:async()=>''},now);
 assert.equal(job.targets.length,16);assert.ok(job.targets.every((t,i)=>job.queue.some(p=>p.target===i)));
 assert.deepEqual(catalog.gsdfProcurementCatalog.map(t=>t.name),rules.defenseBrowserRules.gsdf.targets);
 assert.ok(job.queue.some(p=>p.url.endsWith('/eafin/koubo.html')));
 assert.ok(job.queue.some(p=>p.url.endsWith('/kodaira/keiyaku/koukoku.html')));
 assert.equal(job.targets.some(t=>t.lastSuccessAt),false);
 const length=job.queue.length;assert.equal(engine.addGsdfCatalog(job),false);assert.equal(job.queue.length,length);
});
test('GSDF image maps preserve official navigation; a school introduction alone remains unconfirmed',async()=>{
 const parsed=parser.parseOfficialHtml('<html><body><map><area href="koukoku.html" alt="入札公告"><area href="https://evil.test/secret" alt="公告"></map></body></html>','https://www.mod.go.jp/gsdf/fixture/','gsdf');
 assert.deepEqual(parsed.links.map(l=>l.url),['https://www.mod.go.jp/gsdf/fixture/koukoku.html']);
 const job=engine.newBrowserJob('sfl','gsdf',[],'fulltext',now);
 job.queue=[{url:'https://www.mod.go.jp/gsdf/fixture/',kind:'navigation',target:13,depth:1}];
 await engine.advanceBrowserJob(job,{html:async url=>({url,html:page('<p>学校の概要と教育内容をご案内する紹介ページです。</p>')}),pdf:async()=>''},now);
 assert.equal(engine.browserJobView(job).progress.targets[13].state,'partial');
});
test('GSDF table follows the named original PDF and uses its deadline, not a conflicting list date',async()=>{
 const job=engine.newBrowserJob('sfl','gsdf',['広報'],'fulltext',now);
 const url='https://www.mod.go.jp/gsdf/dc/cfin/html/fee.html';
 job.queue=[{url,kind:'navigation',target:5,depth:1}];
 const html=page('<p>令和8年度調達</p><table><tr><th>品名（件名）</th><th>見積書提出期限</th><th>公告</th></tr><tr><td>広報用シール</td><td>8.9.15</td><td><a href="notice.pdf">公告PDF</a></td></tr></table>');
 const calls=[];
 const transport={html:async url=>({url,html}),pdf:async url=>{calls.push(url);return '広報用シール。見積書提出期限：令和8年9月28日。全省庁統一資格の物品の販売D等級を有する者。';}};
 await engine.advanceBrowserJob(job,transport,now);assert.equal(job.items.length,0);
 await engine.advanceBrowserJob(job,transport,now);
 assert.equal(job.items.length,1);assert.equal(job.items[0].title,'広報用シール');
 assert.equal(job.items[0].deadline,'2026-09-28');assert.equal(job.items[0].sourceUrl,url);
 assert.equal(calls.length,1);assert.match(job.items[0].classification.unifiedEligibleEvidence,/全省庁統一資格/);
});


test('MSDF catalog covers all 33 bases including redirected and consolidated listings',async()=>{
 const job=engine.newBrowserJob('sfl','msdf',['広報'],'fulltext',now);
 await engine.advanceBrowserJob(job,{html:async url=>({url,html:page('<p>各基地の調達情報は個別の案内ページをご確認ください。</p>')}),pdf:async()=>''},now);
 assert.equal(job.targets.length,33);assert.ok(job.targets.every((_,i)=>job.queue.some(p=>p.target===i)));
 assert.ok(job.queue.some(p=>p.url.endsWith('/y3/new_koukoku/OC.html')));
 assert.ok(job.queue.some(p=>p.url.endsWith('/zd/nyuusatsu.html')));
 assert.ok(job.queue.some(p=>p.target===19&&p.url.endsWith('/k0/nyusatsu.html')&&p.agency==='呉地方総監部'));
 assert.ok(job.queue.some(p=>p.target===28&&p.url.endsWith('opklist-08tsushima.pdf')));
 assert.ok(job.targets.every(t=>!t.lastSuccessAt));
 const length=job.queue.length;assert.equal(engine.addMsdfCatalog(job),false);assert.equal(job.queue.length,length);
});
test('legacy MSDF categories migrate without retrying denied URLs or discarding page limits and pauses',()=>{
 const job=engine.newBrowserJob('sfl','msdf',[],'fulltext',now);
 const url='https://www.mod.go.jp/msdf/bukei/d1/nyusatsu.html';
 job.targets=['公募及び企画競争公示','公告','常続的公示'].map(name=>({name,visited:0,errors:0,limited:false,missing:false,notes:[]}));
 job.queue=[];job.seen=['1:'+url];job.visited=70;job.status='paused';job.message='公式ページを取得できませんでした（HTTP 429）。';
 job.pageIssues=[{url,target:1,title:'一般入札公告',status:403,message:'HTTP 403'}];
 assert.equal(engine.addMsdfCatalog(job),true);assert.equal(job.targets.length,33);assert.equal(job.visited,70);
 assert.equal(job.status,'paused');assert.match(job.message,/429/);assert.equal(job.targets[0].visited,1);
 assert.equal(job.pageIssues[0].target,0);assert.ok(!job.queue.some(p=>p.url===url));
});
test('MSDF specifications retain row deadline, earlier participation milestone and source URL',async()=>{
 const job=engine.newBrowserJob('sfl','msdf',['広報'],'fulltext',now);
 const url='https://www.mod.go.jp/msdf/bukei/t2/nyusatsu_op_zentoukyuu2.htm';
 job.queue=[{url,target:6,depth:1,kind:'navigation',agency:'補給本部'}];
 const html=table('<a href="spec.pdf">広報ポスター制作</a>');
 const transport={html:async url=>({url,html}),pdf:async()=> '広報ポスター制作の仕様書。印刷仕様及び納品場所を定める。'};
 await engine.advanceBrowserJob(job,transport,now);await engine.advanceBrowserJob(job,transport,now);
 assert.equal(job.items.length,1);assert.equal(job.items[0].deadline,'2026-09-25');
 assert.equal(job.items[0].milestones[0].date,'2026-09-15');assert.equal(job.items[0].sourceUrl,url);
 assert.ok(job.items[0].classification.openCounterEvidence);
});
test('dynamic loading placeholders stay unconfirmed; application templates are not notices',async()=>{
 const url='https://www.mod.go.jp/msdf/bukei/zd/nyuusatsu.html';
 const html=page('<h1>一般競争入札情報</h1><p>データを読み込み中...</p><p>ファイルが読み込まれていません。</p><a href="form.pdf">入札参加申込書</a>');
 const parsed=parser.parseOfficialHtml(html,url,'msdf');assert.ok(parsed.issue);assert.equal(parsed.links.length,0);
 const job=engine.newBrowserJob('sfl','msdf',[],'fulltext',now);job.queue=[{url,target:13,depth:1,kind:'navigation'}];
 await engine.advanceBrowserJob(job,{html:async url=>({url,html}),pdf:async()=>''},now);
 assert.notEqual(engine.browserJobView(job).progress.targets[13].state,'checked');assert.equal(job.items.length,0);
});
test('MSDF multi-notice PDF separates rows, confirms only explicit supported deadline columns and leaves ambiguity unknown',()=>{
 const url='https://www.mod.go.jp/msdf/bukei/m0/nyuusatsu/07open.pdf';
 const text='番号 調達要求番号 件名 履行期限 本リスト掲載日 見積書提出期限 全省庁統一資格等級等\n8-36 役務 G26-S26-2000489904-00 技能講習(小型移動式クレーン) 2027.3.31 2026.8.31 2026.10.5 役務の提供等 B,C,D等級\n9-2 役務 G26-S26-2000475402-00 技能講習/玉掛け技能講習ほか 2027.2.26 2026.9.1 2026.10.5';
 const parsed=msdfPdf.parseMsdfPdfList(text,url,'オープンカウンター');
 assert.equal(parsed.notices.length,2);assert.ok(parsed.notices.every(n=>n.deadline.date==='2026-10-05'));assert.equal(parsed.issue,undefined);
 const unknown=msdfPdf.parseMsdfPdfList(text.replace('見積書提出期限','見積合わせ日'),url,'オープンカウンター');
 assert.ok(unknown.notices.every(n=>!n.deadline));assert.ok(unknown.issue);
 const missing=msdfPdf.parseMsdfPdfList(text.replace('2026.8.31 ',''),url,'オープンカウンター');
 assert.equal(missing.notices[0].deadline,undefined);assert.ok(missing.issue);
});

test('all three services traverse base, procurement menu, inner listing and original PDF before unrelated documents',async()=>{
 for(const source of ['gsdf','msdf','asdf']){
  const base=`https://www.mod.go.jp/${source}/deep-fixture/`;
  const job=engine.newBrowserJob('sfl',source,['研修'],'fulltext',now);job.retainUnknown=true;
  job.queue=[{url:base,target:0,depth:1,kind:'navigation',title:'基地'}];
  const visited=[];
  const pages={
   [base]:page('<a href="school.pdf">学校紹介</a><a href="forms.pdf">標準契約書</a><a href="menu.html"><img alt="調 達 情 報"></a>'),
   [base+'menu.html']:page('<a href="area.html">オープン・カウンター</a><a href="brochure.pdf">広報誌</a>'),
   [base+'area.html']:page('<h2>見積依頼</h2><a href="list.html">こちら</a>'),
   [base+'list.html']:page('<h2>見積依頼</h2><table><tr><th>件名</th><th>見積書提出期限</th></tr><tr><td><a href="notice.pdf">AI研修の委託</a></td><td>令和8年10月2日</td></tr></table>')
  };
  const transport={html:async url=>{visited.push(url);assert.ok(pages[url],url);return {url,html:pages[url]};},pdf:async url=>{visited.push(url);assert.equal(url,base+'notice.pdf');return 'AI研修の委託。全省庁統一資格。見積書提出期限：令和8年10月2日。';}};
  for(let i=0;i<8&&job.status==='running';i++)await engine.advanceBrowserJob(job,transport,now);
  assert.deepEqual(visited,[base,base+'menu.html',base+'area.html',base+'list.html',base+'notice.pdf']);
  assert.equal(job.items.length,1);assert.equal(job.items[0].officialUrl,base+'notice.pdf');assert.equal(job.items[0].sourceUrl,base+'list.html');
  assert.ok(job.targets[0].listingUrls.includes(base+'area.html'));
 }
});
test('a large base cannot crowd another base inner listings out of the shared queue',async()=>{
 const job=engine.newBrowserJob('sfl','msdf',[],'fulltext',now);job.lastTarget=0;
 const base='https://www.mod.go.jp/msdf/fair-fixture/';
 job.queue=Array.from({length:599},(_,i)=>({url:base+`old${i}.pdf`,target:0,depth:3,kind:'notice',title:'物品購入'}));
 job.queue.push({url:base+'base.html',target:1,depth:1,kind:'navigation',title:'基地'});
 const html=page('<a href="bid.html">一般競争入札公告</a><a href="open.html">オープンカウンター方式</a><a href="request.pdf">研修の委託</a>');
 await engine.advanceBrowserJob(job,{html:async url=>({url,html}),pdf:async()=>''},now);
 assert.ok(job.queue.some(p=>p.url===base+'bid.html'));
 assert.ok(job.queue.some(p=>p.url===base+'open.html'));
 assert.ok(job.queue.length<=600);assert.equal(job.targets[0].limited,true);
});
test('traversal upgrade rechecks published entry links once while preserving denied URLs and saved records',()=>{
 const job=engine.newBrowserJob('sfl','asdf',[],'fulltext',now);job.visited=300;job.status='paused';
 const entry=asdfCatalog.asdfProcurementCatalog[0].entryUrl;
 const denied=asdfCatalog.asdfProcurementCatalog[7].entryUrl;
 job.queue=[{url:entry+'school.pdf',target:0,depth:2,kind:'notice',title:'学校紹介'}];
 job.seen=[`0:${entry}`,`7:${denied}`];job.pageIssues=[{url:denied,title:'十条基地',target:7,status:403,message:'denied'}];
 engine.upgradeProcurementTraversal(job);
 assert.equal(job.status,'paused');assert.equal(job.visited,300);
 assert.ok(job.queue.some(p=>p.url===entry));assert.ok(!job.queue.some(p=>p.url===denied));
 assert.ok(!job.queue.some(p=>p.title==='学校紹介'));
 const count=job.queue.length;assert.equal(engine.upgradeProcurementTraversal(job),false);assert.equal(job.queue.length,count);
});
test('unit navigation is not a notice and genuine brochure-printing notices are retained',()=>{
 const parsed=parser.parseOfficialHtml(page('<a href="school.html">システム通信・サイバー学校</a><a href="brochure.pdf">学校パンフレットの印刷業務</a><a href="intro.pdf">学校紹介</a>'),'https://www.mod.go.jp/gsdf/unit-fixture/','gsdf');
 assert.equal(parsed.links.find(l=>l.title==='システム通信・サイバー学校').notice,false);
 assert.ok(parsed.links.some(l=>l.title==='学校パンフレットの印刷業務'));assert.ok(!parsed.links.some(l=>l.title==='学校紹介'));
});

test('GSDF exclusions migrate saved queues and errors without changing other schools or pause state',async()=>{
 const exclusions=await vite.ssrLoadModule('/lib/procurement-exclusions.ts');
 const job=engine.newBrowserJob('sfl','gsdf',[],'fulltext',now);
 const target=name=>({name,visited:1,errors:1,limited:false,missing:false,notes:['HTTP 403']});
 const removed='https://www.mod.go.jp/gsdf/fsh/fin/keiyaku.htm';
 const retained='https://www.mod.go.jp/gsdf/sigsch/fin/index.html';
 job.targets=[target('富士学校'),target('システム通信・サイバー学校'),target('幹部候補生学校'),target('施設学校'),target('衛生学校')];
 job.queue=[{url:removed,target:0,depth:1,kind:'navigation'},{url:retained,target:1,depth:1,kind:'navigation'}];
 job.seen=[`0:${removed}`,`1:${retained}`];job.pageIssues=[{url:removed,target:0,title:'富士学校',message:'error'},{url:retained,target:1,title:'システム通信・サイバー学校',message:'HTTP 403',status:403}];
 job.items=[{officialUrl:removed,source:'富士学校'},{officialUrl:retained,source:'システム通信・サイバー学校'}];job.status='paused';job.catalogRevision='old';
 assert.equal(engine.applyGsdfExclusions(job),true);
 assert.deepEqual(job.targets.map(t=>t.name),['システム通信・サイバー学校']);
 assert.deepEqual(job.queue.map(p=>[p.target,p.url]),[[0,retained]]);
 assert.deepEqual(job.seen,[`0:${retained}`]);assert.equal(job.pageIssues[0].status,403);assert.equal(job.pageIssues[0].target,0);
 assert.equal(job.items.length,1);assert.equal(job.status,'paused');assert.equal(job.catalogRevision,undefined);
 assert.equal(engine.applyGsdfExclusions(job),false);
 assert.equal(exclusions.isExcludedProcurement({agency:'陸上自衛隊施設学校',officialUrl:'https://www.kkj.go.jp/notices/1'}),true);
 assert.equal(exclusions.isExcludedProcurement({agency:'航空自衛隊幹部候補生学校',officialUrl:'https://www.mod.go.jp/asdf/nara/notice.pdf'}),false);
 const parsed=parser.parseOfficialHtml(page('<a href="/gsdf/ocsh/list.pdf">入札公告</a><a href="/gsdf/sigsch/fin/notice.pdf">入札公告</a>'),rules.defenseBrowserRules.gsdf.entryUrl,'gsdf');
 assert.deepEqual(parsed.links.map(l=>l.url),['https://www.mod.go.jp/gsdf/sigsch/fin/notice.pdf']);
});
test('Kisarazu uses the populated ACS listing and preserves open counter dates and works classification',()=>{
 const entry=asdfCatalog.asdfProcurementCatalog.find(e=>e.name==='木更津分屯基地');
 assert.equal(entry.entryUrl,'https://www.mod.go.jp/asdf/kisarazu/acs/index.html');
 // Public table contents inspected 2026-09-16; no fabricated future OC deadline.
 const parsed=parser.parseOfficialHtml(page('<h3>入札情報</h3><table><tr><th>種別</th><th>入札件名</th><th>入札日</th></tr><tr><td>工事</td><td>構内配電線路補修工事</td><td>R8/10/7 10：00</td></tr></table><h3>オープンカウンター</h3><table><tr><th>件名</th><th>見積書提出期限</th></tr><tr><td>冷凍白玉 外</td><td>R8/9/16</td></tr></table><h3>入札結果</h3><table><tr><th>件名</th><th>落札金額</th></tr><tr><td>完了済み工事</td><td>1000000</td></tr></table>'),entry.entryUrl,'asdf');
 assert.equal(parsed.notices.length,2);assert.equal(parsed.notices[0].deadline,undefined);
 assert.equal(parsed.notices[1].deadline.date,'2026-09-16');assert.match(parsed.notices[1].text,/オープンカウンター/);
});
test('legacy accounting menus retain short category labels behind frames',()=>{
 const frame=parser.parseOfficialHtml('<html><frameset><frame src="menu.html"><frame src="top.html"></frameset></html>','https://www.mod.go.jp/gsdf/mae/mafin/','gsdf');
 assert.equal(frame.links.length,2);
 const menu=parser.parseOfficialHtml('<html><head><title>中部方面会計隊</title></head><body><a href="service.html">役務</a><a href="goods.html">物品</a><a href="oc.html">OC</a></body></html>','https://www.mod.go.jp/gsdf/mae/mafin/menu.html','gsdf');
 assert.equal(menu.links.length,3);assert.ok(menu.links.every(l=>l.priority===1&&!l.notice));
});

test('PDF page-count removal reads all 80 pages including the last page',async()=>{
 const count=80,objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 const kids=[];
 for(let n=1;n<=count;n++){
  const pageId=objects.length+1,contentId=pageId+1;kids.push(`${pageId} 0 R`);
  const stream=`BT /F1 12 Tf 50 700 Td (Procurement page ${n} ${n===80?'FINAL_PAGE_MARKER':''}) Tj ET`;
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 }
 objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${count} >>`;
 let pdf='%PDF-1.4\n';const offsets=[];
 objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
 const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(o=>String(o).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(pdf,{headers:{'content-type':'application/pdf'}});
  const text=await client.fetchOfficialPdf('https://www.mod.go.jp/gsdf/fixture/long.pdf');
  assert.equal((text.match(/Procurement page/g)||[]).length,80);assert.match(text,/page 80 FINAL_PAGE_MARKER/);
 }finally{globalThis.fetch=old;}
});
test('former 40-page failures requeue once without retrying 403 or changing pause state',()=>{
 const job=engine.newBrowserJob('sfl','gsdf',[],'fulltext',now);
 const url='https://www.mod.go.jp/gsdf/eae/fixture.pdf',denied='https://www.mod.go.jp/gsdf/eae/denied.pdf';
 const message='40ページを超えるPDFのため未確認です。';
 job.queue=[];job.status='paused';job.targets[2].errors=2;job.targets[2].notes=[message,'HTTP 403'];
 job.seen=[`2:${url}`,`2:${denied}`];job.pageIssues=[{url,target:2,title:'調達公告',message},{url:denied,target:2,title:'拒否',status:403,message:'HTTP 403'}];
 assert.equal(engine.upgradePdfPageLimit(job),true);assert.equal(job.status,'paused');
 assert.deepEqual(job.queue.map(p=>p.url),[url]);assert.equal(job.targets[2].errors,1);assert.deepEqual(job.targets[2].notes,['HTTP 403']);
 assert.equal(job.pageIssues[0].status,403);assert.ok(job.seen.includes(`2:${denied}`));
 assert.equal(engine.upgradePdfPageLimit(job),false);assert.equal(job.queue.length,1);
});


test('manual notice budget counts nonmatches and defers excess list rows for the next batch',async()=>{
 const job=engine.newBrowserJob('sfl','msdf',['存在しないキーワード'],'fulltext',now);job.retainUnknown=true;
 const url='https://www.mod.go.jp/msdf/budget-fixture/list.html';
 job.queue=[{url,target:0,depth:1,kind:'navigation'}];job.catalogRevision=(await vite.ssrLoadModule('/lib/msdf-procurement-catalog.ts')).msdfCatalogRevision;
 const html=page('<h2>オープンカウンター</h2><table><tr><th>件名</th><th>見積書提出期限</th></tr>'+Array.from({length:150},(_,i)=>`<tr><td>備品の購入 ${i}</td><td>令和8年10月9日</td></tr>`).join('')+'</table>');
 let fetched=0;const transport={html:async()=>{fetched++;return {html,url};},pdf:async()=>''};
 await engine.advanceBrowserJob(job,transport,now,100);
 assert.equal(job.inspected,100);assert.equal(job.items.length,100);assert.equal(job.deferredNotices.length,50);
 assert.ok(job.items.every(i=>!i.matchedKeywords.length));
 job.items=[];await engine.advanceBrowserJob(job,transport,now,100);
 assert.equal(job.inspected,150);assert.equal(job.items.length,50);assert.equal(job.deferredNotices.length,0);assert.equal(fetched,1);
});

test('a batch deadline preserves an unfinished notice for explicit resume',async()=>{
 const job=engine.newBrowserJob('sfl','asdf',['研修'],'fulltext',now);job.retainUnknown=true;
 const url='https://www.mod.go.jp/asdf/budget-fixture/notice.pdf';job.queue=[{url,title:'研修',target:0,depth:1,kind:'notice'}];
 const controller=new AbortController();
 await engine.advanceBrowserJob(job,{html:async()=>{throw Error('unexpected HTML');},pdf:async()=>{controller.abort();throw new DOMException('Time limit','AbortError');}},now,100,controller.signal);
 assert.equal(job.inspected,0);assert.ok(job.queue.some(p=>p.url===url));assert.equal(job.items.length,0);
});
