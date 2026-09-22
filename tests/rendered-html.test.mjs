import assert from "node:assert/strict";
import { after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
// Exercise the exact built Worker and its route wiring against a local D1
// stand-in. No production account, password, candidate or provider is touched.
const root=fileURLToPath(new URL("..",import.meta.url));
const sqlite=new DatabaseSync(":memory:");
for(const file of readdirSync(root+"/drizzle").filter(file=>file.endsWith(".sql")).sort())sqlite.exec(readFileSync(root+"/drizzle/"+file,"utf8"));
const db={prepare(sql){const statement=sqlite.prepare(sql);const bound=(args=[])=>({bind(...values){return bound(values);},async first(){return statement.get(...args)??null;},async run(){return {success:true,meta:statement.run(...args)};},async all(){return {results:statement.all(...args)};}});return bound();},async batch(statements){return Promise.all(statements.map(statement=>statement.all()));}};
globalThis.__renderTestEnv={DB:db,BID_OWNER_EMAIL:"owner@example.test"};
registerHooks({resolve(specifier,context,next){if(specifier==="cloudflare:workers")return {url:"data:text/javascript,export const env = globalThis.__renderTestEnv;",shortCircuit:true};return next(specifier,context);}});
after(()=>{sqlite.close();delete globalThis.__renderTestEnv;});

test("production Worker serves public guides, protects cases, and completes account issue/login/logout",async()=>{
 const workerUrl=new URL("../dist/server/index.js",import.meta.url);workerUrl.searchParams.set("test",`${process.pid}-${Date.now()}`);
 const {default:worker}=await import(workerUrl.href);
 const ctx={waitUntil(){},passThroughOnException(){}},env={ASSETS:{fetch:async()=>new Response("Not found",{status:404})}};
 const origin="https://portal.example.test";
 const response=await worker.fetch(new Request(origin+"/",{headers:{accept:"text/html"}}),env,ctx);
 assert.equal(response.status,200);assert.match(response.headers.get("content-type"),/^text\/html\b/i);
 const html=await response.text();assert.match(html,/会員ログイン/);assert.match(html,/ログインID/);assert.match(html,/使い方・ガイドを見る/);assert.doesNotMatch(html,/class="oc-feature/);
 const guest=response.headers.get("set-cookie").split(";")[0];assert.match(guest,/__Host-bid-guest=[a-f0-9]{64}/);
 const request=async(path,body,extra={})=>worker.fetch(new Request(origin+path,{method:body?"POST":"GET",headers:{cookie:guest,origin,...(body?{"Content-Type":"application/json"}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
 const publicSession=await(await request("/api/workspace")).json();assert.equal(publicSession.membership.allowed,false);assert.deepEqual(publicSession.members,[]);
 for(const path of ["/api/open-counter","/api/discovery","/api/bids","/api/bid-insights","/api/discovery/progress","/api/procurement-workbench"]){const denied=await request(path);assert.equal(denied.status,401,path);assert.equal((await denied.json()).code,"member_login_required");}
 const credentials={loginId:"built-worker-test",name:"組立確認用会員",password:"Only-local-worker-test-password"};
 assert.equal((await request("/api/member-accounts",credentials)).status,403);
 const owner={"oai-authenticated-user-id":"owner-id","oai-authenticated-user-email":"owner@example.test"};
 const issued=await request("/api/member-accounts",credentials,owner);assert.equal(issued.status,201);assert.doesNotMatch(JSON.stringify(await issued.json()),/password_hash|token_hash/);
 const authenticated=await request("/api/member-access",{action:"login",loginId:credentials.loginId,password:credentials.password});assert.equal(authenticated.status,200);
 const memberCookie=authenticated.headers.get("set-cookie");assert.match(memberCookie,/__Host-bid-member=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800/);
 const member={cookie:guest+"; "+memberCookie.split(";")[0]};
 const memberSession=await(await request("/api/workspace",undefined,member)).json();assert.equal(memberSession.membership.allowed,true);assert.equal(memberSession.membership.kind,"member");
 assert.equal((await request("/api/member-accounts",undefined,member)).status,403);
 const profileSave=await request("/api/procurement-workbench",{action:"profile",profile:{name:"保存確認用",specialties:"研修"}},member);assert.equal(profileSave.status,403);
 const preferences=await request("/api/procurement-workbench",undefined,member);assert.equal(preferences.status,200);const fixed=(await preferences.json()).profile;assert.equal(fixed.goodsGrade,"D");assert.equal(fixed.serviceGrade,"D");assert.equal(fixed.purchaseGrade,"C");
 const querySave=await request("/api/procurement-workbench",{action:"save-search",search:{name:"研修の確認条件",mode:"sfl",keywords:"研修",exclude:"",source:"all",category:"all",newOnly:false,filters:{region:"東京都"}}},member);assert.equal(querySave.status,200);
 const restored=await(await request("/api/procurement-workbench",undefined,member)).json();assert.equal(restored.searches[0].filters.region,"東京都");
 const feature=await request("/api/open-counter?view=soon",undefined,member);assert.equal(feature.status,200);assert.equal((await feature.json()).total,0);
 const insights=await request("/api/bid-insights",undefined,member);assert.equal(insights.status,200);assert.equal((await insights.json()).stats.managed,0);
 const logout=await request("/api/member-access",{action:"logout"},member);assert.equal(logout.status,200);assert.match(logout.headers.get("set-cookie"),/Max-Age=0/);
 assert.equal((await request("/api/open-counter",undefined,member)).status,401);
});
