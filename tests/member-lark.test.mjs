import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url)), sqlite = new DatabaseSync(":memory:");
for (const file of readdirSync(root + "/drizzle").filter(name => name.endsWith(".sql")).sort()) sqlite.exec(readFileSync(root + "/drizzle/" + file, "utf8"));
const db = { prepare(sql) { const statement = sqlite.prepare(sql); const bound = (args = []) => ({ bind(...values) { return bound(values); }, async first() { return statement.get(...args) ?? null; }, async run() { return { success: true, meta: statement.run(...args) }; }, async all() { return { results: statement.all(...args) }; } }); return bound(); } };
db.batch = async statements => Promise.all(statements.map(statement => statement.run()));
globalThis.__memberLarkEnv = { DB: db, PORTAL_CREDENTIAL_ENCRYPTION_KEY: "b2".repeat(32), BID_OWNER_EMAIL: "owner@example.test", LARK_APP_ID: "cli_sfl", LARK_APP_SECRET: "sfl-fixture-only-secret", LARK_BASE_APP_TOKEN: "baseSfl", LARK_CONNECTION_ENCRYPTION_KEY: "a1".repeat(32) };
const vite = await createServer({ configFile: false, appType: "custom", root, server: { middlewareMode: true, hmr: false }, resolve: { alias: { "@": root } }, plugins: [{ name: "lark-fixtures", resolveId(id) { if (id === "cloudflare:workers") return "\0lark-env"; }, load(id) { if (id === "\0lark-env") return "export const env=globalThis.__memberLarkEnv;"; } }] });
const auth = await vite.ssrLoadModule("/lib/member-auth.ts");
const config = await vite.ssrLoadModule("/app/api/lark/member-connection/route.ts");
const registration = await vite.ssrLoadModule("/app/api/lark/registrations/route.ts");
const status = await vite.ssrLoadModule("/app/api/lark/registrations/status/route.ts");
const template = await vite.ssrLoadModule("/app/api/lark/template/route.ts");
const domain = await vite.ssrLoadModule("/lib/lark-registration.ts");
const secrets = await vite.ssrLoadModule("/lib/lark-secret.ts");
const destination = await vite.ssrLoadModule("/lib/lark-destination.ts");
const { discoveryFeed, saveDiscovered } = await vite.ssrLoadModule("/lib/discovery-store.ts");
const owner = { "oai-authenticated-user-id": "owner", "oai-authenticated-user-email": "owner@example.test" };
const req = (method = "GET", body, headers = {}, query = "") => new Request("https://portal.example.test/api/test" + query, { method, headers: { ...headers, ...(body ? { "Content-Type": "application/json", Origin: "https://portal.example.test" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
async function member(loginId) {
  await auth.createAccount({ loginId, name: loginId, password: "Test-only-password-2026" });
  const token = await auth.loginMember(req(), { loginId, password: "Test-only-password-2026" });
  const headers = { cookie: "__Host-bid-member=" + token }, actor = await auth.requireSearchMember(req("GET", undefined, headers));
  return { headers, actor, id: actor.id.slice(8) };
}
const a = await member("member-a"), b = await member("member-b");
const fields = [{ field_name: "都道府県", type: 3 }, { field_name: "種別管理", type: 3 }, { field_name: "案件先機関名", type: 1 }, { field_name: "案件先URL", type: 15 }, { field_name: "提出期限", type: 5 }];
const originalFetch = globalThis.fetch, calls = [], records = new Map();
let incompatible = false;
globalThis.fetch = async (input, init) => {
  const url = new URL(input); calls.push({ url, init });
  assert.equal(url.origin, "https://open.larksuite.com"); assert.equal(init.redirect, "manual");
  if (url.pathname.endsWith("/auth/v3/tenant_access_token/internal")) return Response.json({ code: 0, tenant_access_token: JSON.parse(init.body).app_id, expire: 7200 });
  const base = url.pathname.match(/\/apps\/([^/]+)/)?.[1], table = url.pathname.match(/\/tables\/([^/]+)/)?.[1], key = `${base}/${table}`;
  if (base === "baseA") assert.equal(init.headers.Authorization, "Bearer cli_memberA");
  if (base === "baseB") assert.equal(init.headers.Authorization, "Bearer cli_memberB");
  if (url.pathname.endsWith("/fields")) return Response.json({ code: 0, data: { items: incompatible ? [] : fields, has_more: false } });
  if (url.pathname.endsWith("/records/search")) return Response.json({ code: 0, data: { items: records.get(key) ?? [], has_more: false } });
  if (url.pathname.endsWith("/records")) { const record = { record_id: "rec" + calls.length, fields: JSON.parse(init.body).fields }; records.set(key, [...(records.get(key) ?? []), record]); return Response.json({ code: 0, data: { record } }); }
  throw new Error("Unexpected path");
};
after(async () => { globalThis.fetch = originalFetch; await vite.close(); sqlite.close(); delete globalThis.__memberLarkEnv; });
const settings = (suffix) => ({ revision: "", appId: "cli_member" + suffix, appSecret: `secret-for-member-${suffix}`, urls: Object.fromEntries(["sfl", "engineer", "academy"].map(mode => [mode, `https://member${suffix.toLowerCase()}.jp.larksuite.com/base/base${suffix}?table=tbl${suffix}${mode}`])) });
const item = { title: "生成AI研修業務", agency: "テスト機関", deadline: "2099-12-01", officialUrl: "https://agency.example.test/notice/1", prefecture: "滋賀県" };
let aSettings, bSettings;
test("unconfigured members never fall back to SFL and cannot read another member's settings", async () => {
  const count = calls.length;
  assert.equal((await config.GET(req())).status, 401);
  const own = await (await config.GET(req("GET", undefined, a.headers))).json();
  assert.equal(own.configured, false); assert.equal(own.targets, undefined); assert.equal(own.templateUrl, domain.larkMemberTemplateUrl);
  assert.equal((await config.GET(req("GET", undefined, a.headers, `?accountId=${b.id}`))).status, 403);
  const denied = await registration.POST(req("POST", { mode: "sfl", item }, a.headers));
  assert.equal(denied.status, 409); assert.equal((await denied.json()).code, "lark_setup");
  const result = await (await status.POST(req("POST", { mode: "sfl", keys: [await domain.larkRegistrationKey("sfl", item)] }, a.headers))).json();
  assert.equal(result.configured, false); assert.deepEqual(result.registrations, {});
  assert.equal(calls.length, count);
});
test("unsafe destinations, CSRF, SFL source and SFL app credentials fail before contacting Lark", async () => {
  const count = calls.length;
  for (const url of ["http://member.larksuite.com/base/abc?table=tbl1", "https://member.larksuite.com.evil.test/base/a?table=tbl1", "https://name:pass@member.larksuite.com/base/a?table=tbl1", "https://127.0.0.1/base/a?table=tbl1", domain.larkTableUrl("sfl"), domain.larkMemberTemplateUrl + "?table=tblTemplate"] ) assert.throws(() => destination.parseLarkTableUrl(url));
  assert.equal((await config.POST(req("POST", { ...settings("A"), appId: "cli_sfl" }, a.headers))).status, 400);
  const mixed = settings("A"); mixed.urls.academy = settings("B").urls.academy;
  assert.equal((await config.POST(req("POST", mixed, a.headers))).status, 400);
  const cross = req("POST", settings("A"), a.headers); cross.headers.set("origin", "https://evil.test"); assert.equal((await config.POST(cross)).status, 403);
  assert.equal(calls.length, count);
});
test("setup checks cloned fields, creates no records, encrypts credentials and never returns secrets", async () => {
  for (const [member, suffix] of [[a, "A"], [b, "B"]]) {
    const response = await config.POST(req("POST", settings(suffix), member.headers)); assert.equal(response.status, 200, await response.clone().text());
    const data = await response.json(); assert.equal(data.configured, true); assert.equal(data.appId, "cli_member" + suffix);
    assert.doesNotMatch(JSON.stringify(data), /secret-for-member|secret_cipher|appSecret|tenant_access_token/);
    const row = sqlite.prepare("SELECT * FROM member_lark_connections WHERE user_id=?").get(member.actor.id);
    assert.ok(!row.secret_cipher.includes("secret-for-member"));
    assert.equal(await secrets.decryptLarkSecret(row.secret_cipher, member.actor.id), `secret-for-member-${suffix}`);
    await assert.rejects(secrets.decryptLarkSecret(row.secret_cipher, "other-account"));
    if (suffix === "A") aSettings = data; else bSettings = data;
  }
  assert.equal(records.size, 0);
  assert.equal(calls.filter(call => call.url.pathname.endsWith("/fields")).length, 6);
  assert.equal((await config.GET(req("GET", undefined, owner, `?accountId=${a.id}`))).status, 200);
});
test("each member writes to their own Base with their own token; statuses and record links are isolated", async () => {
  const key = await domain.larkRegistrationKey("sfl", item);
  const send = () => registration.POST(req("POST", { mode: "sfl", item, destinationRevision: aSettings.revision, accountId: b.id, tableId: "tblInjected" }, a.headers));
  assert.equal((await send()).status, 200); assert.equal((await (await send()).json()).alreadyRegistered, true);
  const aStatus = await (await status.POST(req("POST", { mode: "sfl", keys: [key] }, a.headers))).json();
  const bStatus = await (await status.POST(req("POST", { mode: "sfl", keys: [key] }, b.headers))).json();
  const ownerStatus = await (await status.POST(req("POST", { mode: "sfl", keys: [key] }, owner))).json();
  assert.equal(aStatus.registrations[key].state, "registered"); assert.match(aStatus.registrations[key].recordUrl, /membera\.jp\.larksuite\.com\/base\/baseA/);
  assert.deepEqual(bStatus.registrations, {}); assert.deepEqual(ownerStatus.registrations, {});
  assert.equal((await registration.POST(req("POST", { mode: "sfl", item, destinationRevision: bSettings.revision }, b.headers))).status, 200);
  assert.equal(records.get("baseA/tblAsfl").length, 1); assert.equal(records.get("baseB/tblBsfl").length, 1);
  assert.equal([...records.keys()].some(key => key.startsWith("baseSfl")), false);
});
test("search registered flags use the authenticated member's destination scope", async () => {
  await saveDiscovered([{ ...item, id: "fixture", source: "海上自衛隊", sourceUrl: "https://www.mod.go.jp/msdf/", summary: "生成AI研修のオープンカウンター公告", descriptionText: "生成AI研修のオープンカウンター公告", deadlineEvidence: "2099年12月1日", contractMethod: "オープンカウンター", matchedKeywords: ["研修"] }]);
  const options = { mode: "sfl", source: "all", bucket: "all", category: "all", keywords: ["研修"], offset: 0, newOnly: false, exclude: [] };
  const aFeed = await discoveryFeed(a.actor, options), unlinked = await discoveryFeed({ id: "account:unlinked", role: "member", name: "C", email: "" }, options);
  assert.equal(aFeed.items.length, 1); assert.equal(unlinked.items.length, 1);
  assert.equal(aFeed.items[0].registered, true); assert.equal(unlinked.items[0].registered, false);
});
test("invalid replacement preserves working connection; stale forms, shared Bases and stale registration destinations fail", async () => {
  assert.equal((await config.POST(req("POST", settings("A"), a.headers))).status, 409);
  incompatible = true;
  assert.equal((await config.POST(req("POST", { ...settings("A"), revision: aSettings.revision }, a.headers))).status, 409);
  incompatible = false;
  assert.equal((await (await config.GET(req("GET", undefined, a.headers))).json()).revision, aSettings.revision);
  assert.equal((await config.POST(req("POST", { ...settings("A"), revision: bSettings.revision }, b.headers))).status, 409);
  const before = records.get("baseA/tblAsfl").length;
  assert.equal((await registration.POST(req("POST", { mode: "sfl", item, destinationRevision: bSettings.revision }, a.headers))).status, 409);
  assert.equal(records.get("baseA/tblAsfl").length, before);
});
test("only owner can publish an empty-template link, and current operational Base is rejected", async () => {
  const valid = { url: "https://template.jp.larksuite.com/base/blankTemplate", emptyTemplateConfirmed: true };
  assert.equal((await template.POST(req("POST", valid, a.headers))).status, 403);
  assert.equal((await template.POST(req("POST", { ...valid, url: domain.larkBaseUrl }, owner))).status, 400);
  assert.equal((await template.POST(req("POST", { ...valid, emptyTemplateConfirmed: false }, owner))).status, 400);
  assert.equal((await template.POST(req("POST", valid, owner))).status, 200);
  assert.equal((await (await config.GET(req("GET", undefined, b.headers))).json()).templateUrl, valid.url);
});
test("free mode uses its own verified member table while preserving the original three registration histories", async () => {
  const count = calls.length, freeKey = await domain.larkRegistrationKey("free", item), sflKey = await domain.larkRegistrationKey("sfl", item);
  assert.equal((await registration.POST(req("POST", { mode: "free", item, destinationRevision: aSettings.revision }, a.headers))).status, 409);
  assert.equal(calls.length, count, "an absent free destination must not use another table");
  const four = { ...settings("A"), revision: aSettings.revision, urls: { ...settings("A").urls, free: "https://membera.jp.larksuite.com/base/baseA?table=tblAfree" } };
  const configured = await config.POST(req("POST", four, a.headers));
  assert.equal(configured.status, 200, await configured.clone().text()); aSettings = await configured.json();
  assert.equal(aSettings.targets.free.tableId, "tblAfree");
  assert.equal((await (await status.POST(req("POST", { mode: "sfl", keys: [sflKey] }, a.headers))).json()).registrations[sflKey].state, "registered");
  const send = () => registration.POST(req("POST", { mode: "free", item, destinationRevision: aSettings.revision, tableId: "tblInjected", accountId: b.id }, a.headers));
  assert.equal((await send()).status, 200); assert.equal((await (await send()).json()).alreadyRegistered, true);
  assert.equal(records.get("baseA/tblAfree").length, 1); assert.equal(records.has("baseA/tblAacademy"), false);
  const aStatus = await (await status.POST(req("POST", { mode: "free", keys: [freeKey] }, a.headers))).json();
  assert.match(aStatus.registrations[freeKey].recordUrl, /table=tblAfree/);
  assert.deepEqual((await (await status.POST(req("POST", { mode: "free", keys: [freeKey] }, b.headers))).json()).registrations, {});
  const feed = await discoveryFeed(a.actor, { mode: "free", source: "all", bucket: "all", category: "all", keywords: ["研修"], offset: 0, newOnly: false, exclude: [] });
  assert.equal(feed.items[0].registered, true);
  incompatible = true;
  assert.equal((await config.POST(req("POST", { ...four, revision: aSettings.revision }, a.headers))).status, 409);
  incompatible = false;
  assert.equal((await (await config.GET(req("GET", undefined, a.headers))).json()).revision, aSettings.revision);
  const changed = await config.POST(req("POST", { ...four, revision: aSettings.revision, urls: { ...four.urls, free: four.urls.free + "New" } }, a.headers));
  assert.equal(changed.status, 200); aSettings = await changed.json();
  assert.deepEqual((await (await status.POST(req("POST", { mode: "free", keys: [freeKey] }, a.headers))).json()).registrations, {});
  assert.equal((await (await status.POST(req("POST", { mode: "sfl", keys: [sflKey] }, a.headers))).json()).registrations[sflKey].state, "registered");
});
test("disconnect stops registration without deleting provider records; invalid encryption key fails closed", async () => {
  const count = [...records.values()].flat().length;
  assert.equal((await config.DELETE(req("DELETE", { revision: aSettings.revision }, a.headers))).status, 200);
  assert.equal((await registration.POST(req("POST", { mode: "sfl", item, destinationRevision: aSettings.revision }, a.headers))).status, 409);
  assert.equal([...records.values()].flat().length, count);
  const key = globalThis.__memberLarkEnv.LARK_CONNECTION_ENCRYPTION_KEY; globalThis.__memberLarkEnv.LARK_CONNECTION_ENCRYPTION_KEY = "";
  try { assert.equal((await config.POST(req("POST", settings("A"), a.headers))).status, 503); }
  finally { globalThis.__memberLarkEnv.LARK_CONNECTION_ENCRYPTION_KEY = key; }
});
