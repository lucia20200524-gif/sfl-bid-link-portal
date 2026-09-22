import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root=fileURLToPath(new URL("..",import.meta.url));
const sqlite=new DatabaseSync(":memory:");
for(const file of readdirSync(root+"/drizzle").filter(file=>file.endsWith(".sql")).sort())sqlite.exec(readFileSync(root+"/drizzle/"+file,"utf8"));
const db={prepare(sql){const statement=sqlite.prepare(sql);const bound=(args=[])=>({bind(...values){return bound(values);},async first(){return statement.get(...args)??null;},async run(){return {success:true,meta:statement.run(...args)};},async all(){return {results:statement.all(...args)};}});return bound();}};
db.batch=async statements=>Promise.all(statements.map(statement=>statement.all()));
globalThis.__portalAccessEnv={DB:db,PORTAL_CREDENTIAL_ENCRYPTION_KEY:"b2".repeat(32),BID_OWNER_EMAIL:"owner@example.test"};
globalThis.__portalAccessHeaders=new Headers();
const vite=await createServer({configFile:false,appType:"custom",root,resolve:{alias:{"@":root}},server:{middlewareMode:true,hmr:false},plugins:[{
 name:"isolated-access-fixtures",enforce:"pre",
 transform(code,id){if(id.endsWith("/app/page.tsx")||id.endsWith("/app/chatgpt-auth.ts"))return code.replaceAll('"next/headers"','"test:request-headers"');},
 resolveId(id){if(id==="cloudflare:workers"||id==="test:request-headers")return "\0fixture:"+id;},
 load(id){if(id==="\0fixture:cloudflare:workers")return "export const env=globalThis.__portalAccessEnv;";if(id==="\0fixture:test:request-headers")return "export async function headers(){return globalThis.__portalAccessHeaders;}";}
}]});
after(async()=>{await vite.close();sqlite.close();delete globalThis.__portalAccessEnv;delete globalThis.__portalAccessHeaders;});
const {default:Home}=await vite.ssrLoadModule("/app/page.tsx");
const workspace=await vite.ssrLoadModule("/app/api/workspace/route.ts");
const accounts=await vite.ssrLoadModule("/app/api/member-accounts/route.ts");
const credentials=await vite.ssrLoadModule("/app/api/member-accounts/credentials/route.ts");
const login=await vite.ssrLoadModule("/app/api/member-access/route.ts");
const {requireSearchMember}=await vite.ssrLoadModule("/lib/member-auth.ts");
const origin="https://portal.example.test";
const owner={"oai-authenticated-user-email":"owner@example.test","oai-authenticated-user-id":"owner-id"};
const outsider={"oai-authenticated-user-email":"outsider@example.test","oai-authenticated-user-id":"outsider-id"};
const password="A-local-test-password-2026";
function request(method="GET",body,headers={}){return new Request(origin+"/",{method,headers:{...headers,...(body?{"Content-Type":"application/json",origin}:{})},...(body?{body:JSON.stringify(body)}:{})});}
const create=async(loginId)=>{const response=await accounts.POST(request("POST",{loginId,name:"テスト会員",password},owner));assert.equal(response.status,201);return (await response.json()).accounts.find(account=>account.loginId===loginId.toLowerCase());};
const signIn=async(loginId,secret=password)=>login.POST(request("POST",{action:"login",loginId,password:secret}));
const cookieOf=response=>response.headers.get("set-cookie").split(";")[0];

test("public shell offers ID/password login and never exposes private result panels or the member directory",async()=>{
 globalThis.__portalAccessHeaders=new Headers();
 const page=renderToStaticMarkup(await Home());
 assert.match(page,/会員ログイン/);assert.match(page,/ログインID/);assert.match(page,/current-password/);assert.match(page,/使い方・ガイドを見る/);
 assert.doesNotMatch(page,/class="oc-feature|class="discovery-workspace/);
 const response=await workspace.GET(request());assert.equal(response.status,200);const session=await response.json();
 assert.equal(session.membership.allowed,false);assert.deepEqual(session.members,[]);assert.match(response.headers.get("Cache-Control"),/no-store/);
 assert.equal(sqlite.prepare("SELECT count(*) AS count FROM portal_accounts").get().count,0,"no shipped default credentials");
});

test("all case-data endpoints reject anonymous and unrelated ChatGPT identities before reading or writing",async()=>{
 const protectedRoutes={"discovery":["GET","POST"],"discovery/progress":["GET"],"open-counter":["GET"],"bids":["GET","POST"],"bids/[id]":["GET","PATCH"],"dashboard":["GET"],"bid-insights":["GET"],"browser-search":["GET","POST"],"collect":["POST"],"procurement-workbench":["GET","POST"],"lark/registrations":["POST"],"lark/registrations/status":["POST"]};
 for(const headers of [{},outsider,{cookie:"__Host-bid-member="+"a".repeat(64)}]){
  for(const [path,methods]of Object.entries(protectedRoutes)){
   const route=await vite.ssrLoadModule(`/app/api/${path}/route.ts`);
   for(const method of methods){const r=await route[method](request(method,method==="GET"?undefined:{},headers),{params:Promise.resolve({id:"private-id"})});assert.equal(r.status,401,`${path} ${method}`);assert.equal((await r.json()).code,"member_login_required");}
  }
 }
 assert.equal(sqlite.prepare("SELECT count(*) AS count FROM bids").get().count,0);
});

test("only the current owner can issue, list or change ID accounts; account responses omit secrets",async()=>{
 for(const headers of [{},outsider])for(const [method,body]of [["GET",undefined],["POST",{loginId:"forbidden",name:"Denied",password}],["PATCH",{action:"status",id:crypto.randomUUID(),active:true}]])assert.equal((await accounts[method](request(method,body,headers))).status,403);
 const account=await create("Member.One");
 assert.equal(account.loginId,"member.one");assert.equal(account.active,1);assert.equal(account.name,"テスト会員");
 assert.doesNotMatch(JSON.stringify(account),/password|hash|token/i);
 const row=sqlite.prepare("SELECT password_hash FROM portal_accounts WHERE id=?").get(account.id);assert.match(row.password_hash,/^scrypt\$16384\$8\$5\$/);assert.ok(!row.password_hash.includes(password));
 assert.equal((await accounts.POST(request("POST",{loginId:"MEMBER.ONE",name:"Duplicate",password},owner))).status,409);
 assert.equal((await accounts.POST(request("POST",{loginId:"short-pass",name:"Short",password:"1234"},owner))).status,400);
 const session=await(await workspace.GET(request("GET",undefined,owner))).json();assert.equal(session.membership.kind,"owner");assert.equal(session.membership.allowed,true);
 // A historical owner row alone is not sufficient after ownership changes.
 sqlite.prepare("UPDATE bid_members SET role='owner' WHERE email='outsider@example.test'").run();
 assert.equal((await accounts.GET(request("GET",undefined,outsider))).status,403);
});

test("valid login rotates opaque secure sessions, opens data APIs, and cannot grant administration",async()=>{
 const response=await signIn("MEMBER.ONE");assert.equal(response.status,200);
 assert.match(response.headers.get("set-cookie"),/^__Host-bid-member=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800$/);
 const cookie=cookieOf(response),token=cookie.split("=")[1];
 const stored=sqlite.prepare("SELECT token_hash FROM portal_member_sessions").get();assert.notEqual(stored.token_hash,token);
 const actor=await requireSearchMember(request("GET",undefined,{cookie}));assert.match(actor.id,/^account:/);assert.equal(actor.role,"member");
 const session=await(await workspace.GET(request("GET",undefined,{cookie}))).json();assert.equal(session.membership.loginId,"member.one");
 const bids=await vite.ssrLoadModule("/app/api/bids/route.ts");assert.equal((await bids.GET(request("GET",undefined,{cookie}))).status,200);
 assert.equal((await accounts.GET(request("GET",undefined,{cookie}))).status,403);
 const again=await login.POST(request("POST",{action:"login",loginId:"member.one",password},{cookie}));assert.equal(again.status,200);assert.notEqual(cookieOf(again),cookie);
 await assert.rejects(requireSearchMember(request("GET",undefined,{cookie})),error=>error.status===401);
 const next=cookieOf(again);assert.equal((await requireSearchMember(request("GET",undefined,{cookie:next}))).id,actor.id);
 const logout=await login.POST(request("POST",{action:"logout"},{cookie:next}));assert.equal(logout.status,200);assert.match(logout.headers.get("set-cookie"),/Max-Age=0/);
 await assert.rejects(requireSearchMember(request("GET",undefined,{cookie:next})),error=>error.status===401);
});

test("suspension, password reset and expiry revoke sessions on every request; re-enabling never revives old sessions",async()=>{
 const account=await create("revocation");
 const cookie=cookieOf(await signIn("revocation"));
 assert.equal((await accounts.PATCH(request("PATCH",{action:"status",id:account.id,active:false},owner))).status,200);
 await assert.rejects(requireSearchMember(request("GET",undefined,{cookie})),e=>e.status===401);
 const disabled=await signIn("revocation");assert.equal(disabled.status,401);
 await accounts.PATCH(request("PATCH",{action:"status",id:account.id,active:true},owner));
 await assert.rejects(requireSearchMember(request("GET",undefined,{cookie})),e=>e.status===401);
 const second=cookieOf(await signIn("revocation"));
 const replacement="Changed-test-password-only-2026";
 await accounts.PATCH(request("PATCH",{action:"password",id:account.id,password:replacement},owner));
 await assert.rejects(requireSearchMember(request("GET",undefined,{cookie:second})),e=>e.status===401);
 assert.equal((await signIn("revocation")).status,401);
 const third=cookieOf(await signIn("revocation",replacement));
 sqlite.prepare("UPDATE portal_member_sessions SET expires_at=0 WHERE account_id=?").run(account.id);
 await assert.rejects(requireSearchMember(request("GET",undefined,{cookie:third})),e=>e.status===401);
});

test("unknown IDs, incorrect passwords and disabled IDs return the same message; attempts are bounded",async()=>{
 const unknown=await signIn("unknown-account"),wrong=await signIn("member.one","incorrect-password");
 assert.equal(unknown.status,401);assert.equal(wrong.status,401);assert.deepEqual(await unknown.json(),await wrong.json());
 for(let index=1;index<8;index++)assert.equal((await signIn("unknown-account")).status,401);
 assert.equal((await signIn("unknown-account")).status,429);
 assert.equal((await signIn("bad' OR 1=1 --")).status,400);
 assert.equal(sqlite.prepare("SELECT count(*) AS n FROM portal_accounts").get().n,2);
});

test("cross-site mutations and malformed bodies fail without issuing sessions or changing accounts",async()=>{
 const cross=request("POST",{action:"login",loginId:"member.one",password});cross.headers.set("origin","https://attacker.example");assert.equal((await login.POST(cross)).status,403);
 const admin=request("POST",{loginId:"csrf",name:"Denied",password},owner);admin.headers.set("sec-fetch-site","cross-site");assert.equal((await accounts.POST(admin)).status,403);
 const malformed=new Request(origin,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"logout"})});assert.equal((await login.POST(malformed)).status,415);
});

test("membership database failure fails closed",async()=>{
 const saved=globalThis.__portalAccessEnv.DB;globalThis.__portalAccessEnv.DB=undefined;
 try{await assert.rejects(requireSearchMember(request("GET",undefined,{cookie:"__Host-bid-member="+"a".repeat(64)})),e=>e.status===503);}finally{globalThis.__portalAccessEnv.DB=saved;}
});

test("a member Base URL persists through creation and edits without configuring Lark or revoking login",async()=>{
 const base="https://member.jp.larksuite.com/base/memberBase";
 const created=await accounts.POST(request("POST",{loginId:"base-url",name:"URL会員",password,larkBaseUrl:` ${base}/?table=tblExample&view=vewExample#record `},owner));
 assert.equal(created.status,201);
 const account=(await created.json()).accounts.find(row=>row.loginId==="base-url");
 assert.equal(account.larkBaseUrl,base);assert.equal(account.larkConfigured,false);
 assert.equal(sqlite.prepare("SELECT lark_base_url FROM portal_accounts WHERE id=?").get(account.id).lark_base_url,base);
 assert.equal(sqlite.prepare("SELECT count(*) AS n FROM member_lark_connections").get().n,0);
 const cookie=cookieOf(await signIn("base-url"));
 const memberSettings=await vite.ssrLoadModule("/app/api/lark/member-connection/route.ts");
 const settings=await(await memberSettings.GET(request("GET",undefined,{cookie}))).json();
 assert.equal(settings.savedBaseUrl,base);assert.equal(settings.configured,false);
 const otherCookie=cookieOf(await signIn("member.one"));
 const otherSettings=await(await memberSettings.GET(request("GET",undefined,{cookie:otherCookie}))).json();
 assert.equal(otherSettings.savedBaseUrl,"");
 for(const headers of [{},outsider,{cookie}])assert.equal((await accounts.PATCH(request("PATCH",{id:account.id,action:"lark-url",larkBaseUrl:base+"Other"},headers))).status,403);
 const patch={id:account.id,action:"lark-url",larkBaseUrl:"https://member.jp.larksuite.com/wiki/newBase?table=tblAnother"};
 const csrf=request("PATCH",patch,owner);csrf.headers.set("origin","https://attacker.example");assert.equal((await accounts.PATCH(csrf)).status,403);
 const changed=await accounts.PATCH(request("PATCH",patch,owner));assert.equal(changed.status,200);
 const listed=await(await accounts.GET(request("GET",undefined,owner))).json();
 assert.equal(listed.accounts.find(row=>row.id===account.id).larkBaseUrl,"https://member.jp.larksuite.com/wiki/newBase");
 assert.equal((await requireSearchMember(request("GET",undefined,{cookie}))).id,"account:"+account.id);
 const cleared=await accounts.PATCH(request("PATCH",{...patch,larkBaseUrl:""},owner));assert.equal(cleared.status,200);
 assert.equal((await cleared.json()).accounts.find(row=>row.id===account.id).larkBaseUrl,"");
});

test("invalid or operational Base URLs fail before creating an account",async()=>{
 const before=sqlite.prepare("SELECT count(*) AS n FROM portal_accounts").get().n;
 for(const larkBaseUrl of ["javascript:alert(1)","https://evil.example/base/test","http://a.larksuite.com/base/test","https://a.larksuite.com.evil.example/base/test","https://user:pass@a.larksuite.com/base/test","https://a.larksuite.com:444/base/test","https://a.larksuite.com/docx/test","https://bjp66vk3my8x.jp.larksuite.com/wiki/EvGnwALQmi1uRLkhTjNjx5N0pJh"]){
  const response=await accounts.POST(request("POST",{loginId:"invalid-base",name:"Rejected",password,larkBaseUrl},owner));assert.equal(response.status,400,larkBaseUrl);
 }
 assert.equal(sqlite.prepare("SELECT count(*) AS n FROM portal_accounts").get().n,before);
});

test("a saved URL cannot silently replace an already verified member connection",async()=>{
 const account=sqlite.prepare("SELECT id FROM portal_accounts WHERE login_id='base-url'").get();
 const targets=Object.fromEntries(["sfl","engineer","academy"].map(mode=>[mode,{name:mode,tableId:"tbl"+mode,url:"https://verified.jp.larksuite.com/base/actualBase?table=tbl"+mode}]));
 sqlite.prepare("INSERT INTO member_lark_connections (user_id,app_id,secret_cipher,base_token,targets_json,revision,checked_at) VALUES (?,?,?,?,?,?,?)").run("account:"+account.id,"cli_test","opaque-secret","actualBase",JSON.stringify(targets),"revision",Date.now());
 try{
  const listed=await(await accounts.GET(request("GET",undefined,owner))).json();
  const row=listed.accounts.find(item=>item.id===account.id);assert.equal(row.larkConfigured,true);assert.equal(row.larkBaseUrl,"https://verified.jp.larksuite.com/base/actualBase");assert.doesNotMatch(JSON.stringify(row),/opaque-secret|cli_test|targetsJson/);
  const changed=await accounts.PATCH(request("PATCH",{id:account.id,action:"lark-url",larkBaseUrl:"https://other.jp.larksuite.com/base/otherBase"},owner));assert.equal(changed.status,409);
  assert.equal(sqlite.prepare("SELECT targets_json FROM member_lark_connections WHERE user_id=?").get("account:"+account.id).targets_json,JSON.stringify(targets));
 }finally{sqlite.prepare("DELETE FROM member_lark_connections WHERE user_id=?").run("account:"+account.id);}
});

test("credential viewing is owner-only, encrypted at rest, audited, uncached and bound to the selected account",async()=>{
 const account=await create("credential-view"), second=await create("credential-other");
 const cookie=cookieOf(await signIn("credential-view"));
 const row=sqlite.prepare("SELECT credential_cipher AS cipher,password_hash AS hash FROM portal_accounts WHERE id=?").get(account.id);
 assert.match(row.cipher,/^v1\./);assert.ok(!row.cipher.includes(password));assert.ok(!row.hash.includes(password));
 for(const headers of [{},outsider,{cookie}])assert.equal((await credentials.POST(request("POST",{id:account.id},headers))).status,403);
 const cross=request("POST",{id:account.id},owner);cross.headers.set("origin","https://attacker.example");assert.equal((await credentials.POST(cross)).status,403);
 const response=await credentials.POST(request("POST",{id:account.id},owner));
 assert.equal(response.status,200);assert.match(response.headers.get("Cache-Control"),/private, no-store/);
 assert.deepEqual(await response.json(),{loginId:account.loginId,password});
 const audit=sqlite.prepare("SELECT * FROM portal_credential_views WHERE account_id=?").all(account.id);
 assert.equal(audit.length,1);assert.equal(audit[0].viewed_by,"owner-id");assert.ok(!JSON.stringify(audit).includes(password));
 const list=await(await accounts.GET(request("GET",undefined,owner))).text();assert.ok(!list.includes(password));assert.ok(!list.includes(row.cipher));
 sqlite.prepare("UPDATE portal_accounts SET credential_cipher=? WHERE id=?").run(row.cipher,second.id);
 assert.equal((await credentials.POST(request("POST",{id:second.id},owner))).status,503,"ciphertext cannot be moved between accounts");
 sqlite.prepare("UPDATE portal_accounts SET credential_cipher='' WHERE id=?").run(account.id);
 const legacy=await(await credentials.POST(request("POST",{id:account.id},owner))).json();assert.equal(legacy.password,null);assert.match(legacy.message,/復元できません/);
 const changed="Reissued-test-password-only-2026";
 assert.equal((await accounts.PATCH(request("PATCH",{action:"password",id:account.id,password:changed},owner))).status,200);
 assert.equal((await(await credentials.POST(request("POST",{id:account.id},owner))).json()).password,changed);
 assert.equal((await signIn("credential-view",changed)).status,200);
 const key=globalThis.__portalAccessEnv.PORTAL_CREDENTIAL_ENCRYPTION_KEY;
 globalThis.__portalAccessEnv.PORTAL_CREDENTIAL_ENCRYPTION_KEY="";
 try{assert.equal((await accounts.POST(request("POST",{loginId:"missing-key",name:"Denied",password},owner))).status,503);assert.equal(sqlite.prepare("SELECT id FROM portal_accounts WHERE login_id='missing-key'").get(),undefined);}
 finally{globalThis.__portalAccessEnv.PORTAL_CREDENTIAL_ENCRYPTION_KEY=key;}
});
