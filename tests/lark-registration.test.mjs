import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("..", import.meta.url));
const sqlite = new DatabaseSync(":memory:");
for (const file of readdirSync(root + "/drizzle").filter(file => file.endsWith(".sql")).sort()) sqlite.exec(readFileSync(root + "/drizzle/" + file, "utf8"));
const d1 = { prepare(sql) { const statement = sqlite.prepare(sql); return { bind(...params) { return { async run() { return { success: true, meta: statement.run(...params) }; }, async first() { return statement.get(...params) ?? null; }, async all() { return { results: statement.all(...params) }; } }; } }; } };
const testEnv = { DB: d1, BID_OWNER_EMAIL: "owner@example.test", LARK_APP_ID: "cli_test", LARK_APP_SECRET: "dummy-test-secret", LARK_BASE_APP_TOKEN: "baseTest" };
testEnv.PORTAL_CREDENTIAL_ENCRYPTION_KEY = "b2".repeat(32);
globalThis.__larkTestEnv = testEnv;
const vite = await createServer({
  configFile: false, appType: "custom", root,
  resolve: { alias: [{ find: "cloudflare:workers", replacement: "\0lark-test-env" }, { find: "@", replacement: root }] },
  plugins: [{ name: "lark-test-env", resolveId(id) { if (id === "\0lark-test-env") return id; }, load(id) { if (id === "\0lark-test-env") return "export const env = globalThis.__larkTestEnv;"; } }],
  server: { middlewareMode: true, hmr: false },
});
const { POST } = await vite.ssrLoadModule("/app/api/lark/registrations/route.ts");
const { POST: statuses } = await vite.ssrLoadModule("/app/api/lark/registrations/status/route.ts");
const { GET: connection } = await vite.ssrLoadModule("/app/api/lark/connection/route.ts");
const domain = await vite.ssrLoadModule("/lib/lark-registration.ts");
const auth = await vite.ssrLoadModule("/lib/member-auth.ts");
await auth.createAccount({loginId:"lark-member",name:"Lark会員",password:"local-test-password-for-lark"});
const memberToken=await auth.loginMember(new Request("https://portal.example.test"),{loginId:"lark-member",password:"local-test-password-for-lark"});
const memberHeaders={"oai-authenticated-user-id":"","oai-authenticated-user-email":"",cookie:"__Host-bid-member="+memberToken};
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; delete globalThis.__larkTestEnv; await vite.close(); sqlite.close(); });

const candidate = { title: "Webサイト制作業務", agency: "発注機関テスト", prefecture: "滋賀県", deadline: "2099-10-05", officialUrl: "https://agency.example.test/notice?project=1", classification: { openCounterEvidence: "オープンカウンター方式", unifiedRequiredEvidence: "全省庁統一資格を有する者" } };
const fields = [
  { field_name: "都道府県", type: 3, property: { options: [{ name: "滋賀県" }] } },
  { field_name: "種別管理", type: 3, property: { options: [{ name: "オープンカウンター" }, { name: "全省庁統一資格必須" }] } },
  { field_name: "案件先機関名", type: 1 }, { field_name: "案件先URL", type: 15 }, { field_name: "提出期限", type: 5 },
];
const request = (mode = "sfl", item = candidate, headers = {}) => new Request("https://portal.example.test/api/lark/registrations", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://portal.example.test", "oai-authenticated-user-id": "owner-id", "oai-authenticated-user-email": "owner@example.test", ...headers }, body: JSON.stringify({ mode, item, tableId: "tblInjected", fields: { "入札額": 999 } }) });
const ok = data => Response.json({ code: 0, data });
let sequence = 0;
function fakeLark(options = {}) {
  sqlite.exec("DELETE FROM lark_bid_registrations;");
  testEnv.LARK_APP_SECRET = `dummy-test-${++sequence}`;
  const records = new Map(), creates = [], requests = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input); requests.push({ url, init });
    assert.equal(url.origin, "https://open.larksuite.com");
    assert.equal(init.redirect, "manual", "provider credentials must never follow redirects");
    if (url.pathname.endsWith("/auth/v3/tenant_access_token/internal")) return Response.json({ code: 0, tenant_access_token: "test-token", expire: 7200 });
    const table = url.pathname.match(/\/tables\/([^/]+)/)?.[1];
    if (url.pathname.endsWith("/fields")) return options.fieldsResponse?.() ?? ok({ items: options.fields ?? fields, has_more: false });
    if (url.pathname.endsWith("/records/search")) {
      assert.deepEqual(JSON.parse(init.body).field_names, ["案件先機関名", "案件先URL"]);
      return ok({ items: records.get(table) ?? [], has_more: false });
    }
    if (url.pathname.endsWith("/records") && init.method === "POST") {
      const payload = JSON.parse(init.body), record = { record_id: `recTest${sequence}${creates.length + 1}`, fields: payload.fields };
      creates.push({ table, payload, token: url.searchParams.get("client_token") });
      if (options.beforeCreate) await options.beforeCreate();
      if (!options.dropWrite) records.set(table, [...(records.get(table) ?? []), record]);
      if (options.loseResponse) throw new Error("simulated network interruption");
      return ok({ record });
    }
    throw new Error("Unexpected request: " + url.pathname);
  };
  return { records, creates, requests };
}

test("membership, origin, destination and deadline validation run before external access", async () => {
  let external = 0; globalThis.fetch = async () => { external++; throw new Error("must not call Lark"); };
  assert.equal((await POST(request("sfl", { ...candidate, deadline: "2000-01-01" }, { "oai-authenticated-user-id": "", "oai-authenticated-user-email": "" }))).status, 401);
  assert.equal((await connection(request("sfl", candidate, { "oai-authenticated-user-id": "", "oai-authenticated-user-email": "" }))).status, 403);
  assert.equal((await POST(request("sfl", candidate, { Origin: "https://other.example.test" }))).status, 403);
  assert.equal((await POST(request("arbitrary-table"))).status, 400);
  assert.equal((await POST(request("sfl", { ...candidate, officialUrl: "javascript:alert(1)" }))).status, 400);
  assert.equal((await POST(request("sfl", { ...candidate, deadline: "2026-02-30" }))).status, 400);
  assert.equal((await POST(request("sfl", { ...candidate, deadline: "2000-01-01" }))).status, 400);
  assert.equal(external, 0);
});

test("three tabs write to exactly three existing tables, only five allowed fields, and repeated registration is idempotent", async () => {
  const service = fakeLark();
  for (const mode of ["sfl", "engineer", "academy"]) {
    const first = await POST(request(mode, candidate)); assert.equal(first.status, 200);
    assert.equal((await first.json()).alreadyRegistered, false);
    const second = await POST(request(mode, { ...candidate, deadline: "2099-10-06", officialUrl: candidate.officialUrl + "&utm_source=test" }));
    assert.equal(second.status, 200); assert.equal((await second.json()).alreadyRegistered, true);
    const key = await domain.larkRegistrationKey(mode, candidate);
    const statusRequest = new Request("https://portal.example.test/api/lark/registrations/status", { method: "POST", headers: request().headers, body: JSON.stringify({ mode, keys: [key] }) });
    const status = await (await statuses(statusRequest)).json();
    assert.equal(status.registrations[key].state, "registered");
    assert.equal(new URL(status.registrations[key].recordUrl).searchParams.get("table"), domain.larkTargets[mode].tableId);
  }
  assert.deepEqual(service.creates.map(row => row.table), ["tblIHEsNQqagkYqH", "tblvSax8yNyeZoMv", "tblruF7Nc862pCWC"]);
  for (const row of service.creates) {
    assert.deepEqual(Object.keys(row.payload.fields).sort(), ["都道府県", "種別管理", "案件先機関名", "案件先URL", "提出期限"].sort());
    assert.equal(row.payload.fields["種別管理"], "全省庁統一資格必須");
    assert.deepEqual(row.payload.fields["案件先URL"], { text: candidate.title, link: candidate.officialUrl });
    assert.equal(row.payload.fields["提出期限"], Date.parse("2099-10-05T00:00:00+09:00"));
    assert.match(row.token, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  }
  assert.equal((await (await connection(new Request("https://portal.example.test/api/lark/connection", { headers: request().headers }))).json()).connected, true);
});

test("simultaneous clicks share a database lock and create only one record", async () => {
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  const service = fakeLark({ beforeCreate: async () => { started(); await hold; } });
  const first = POST(request()); await entered;
  const second = await POST(request()); assert.equal(second.status, 409);
  assert.equal((await second.json()).code, "lark_processing");
  release(); assert.equal((await first).status, 200);
  assert.equal((await POST(request())).status, 200);
  assert.equal(service.creates.length, 1);
});

test("a lost success response is reconciled from Lark, and an unresolved write is never sent twice", async () => {
  for (const dropWrite of [false, true]) {
    const service = fakeLark({ loseResponse: true, dropWrite });
    const failed = await POST(request()); assert.equal(failed.status, 502);
    assert.equal((await failed.json()).code, "lark_uncertain");
    const retried = await POST(request());
    assert.equal(retried.status, dropWrite ? 409 : 200);
    const data = await retried.json();
    if (dropWrite) { assert.equal(data.code, "lark_uncertain"); assert.equal(data.registered, undefined); }
    else { assert.equal(data.alreadyRegistered, true); assert.equal(data.registered, true); }
    assert.equal(service.creates.length, 1);
  }
});

test("existing Lark records are detected; unmatched select values never change the Base schema", async () => {
  const service = fakeLark();
  service.records.set(domain.larkTargets.sfl.tableId, [{ record_id: "recExisting", fields: { "案件先機関名": candidate.agency, "案件先URL": { text: candidate.title, link: candidate.officialUrl } } }]);
  assert.equal((await (await POST(request())).json()).alreadyRegistered, true);
  assert.equal(service.creates.length, 0);
  const unknown = await POST(request("academy", { ...candidate, prefecture: "存在しない県", classification: {} }));
  assert.equal(unknown.status, 200); const result = await unknown.json(); assert.equal(result.warnings.length, 2);
  assert.deepEqual(Object.keys(service.creates[0].payload.fields).sort(), ["案件先機関名", "案件先URL", "提出期限"].sort());
  assert.equal(service.requests.some(row => row.url.pathname.endsWith("/fields") && row.init.method !== "GET"), false);
});

test("schema and permission failures never appear as a successful registration or expose credentials", async () => {
  let service = fakeLark({ fields: fields.map(field => field.field_name === "種別管理" ? { ...field, type: 1 } : field) });
  const incompatible = await POST(request()); assert.equal(incompatible.status, 409); assert.equal(service.creates.length, 0);
  service = fakeLark({ fieldsResponse: () => Response.json({ code: 99991672, msg: "private upstream error with dummy-test-secret" }) });
  const denied = await POST(request()); assert.equal(denied.status, 503);
  const body = await denied.text(); assert.doesNotMatch(body, /dummy-test-secret|private upstream/); assert.equal(service.creates.length, 0);
  testEnv.LARK_APP_SECRET = "";
  const unset = await POST(request()); assert.equal(unset.status, 503); assert.equal((await unset.json()).code, "lark_setup");
});

test("every tab renders the matching Lark destination and readable registration actions without removed columns", async () => {
  const { default: Results } = await vite.ssrLoadModule("/app/collection-table.tsx");
  for (const mode of ["sfl", "engineer", "academy"]) {
    const html = renderToStaticMarkup(React.createElement(Results, { mode, result: { items: [{ ...candidate, id: "test", source: "公式公告", sourceUrl: "https://example.test", summary: "", matchedKeywords: [] }], sources: [] }, loading: false, error: "", onRegister() {} }));
    assert.ok(!html.includes(domain.larkTargets[mode].tableId), "registration destination must come from authenticated status, not public markup");
    assert.ok(html.includes("Larkへ登録")); assert.ok(html.includes("ポータルに登録"));
    for (const name of ["担当者", "管理番号", "提出チェック", "入札額", "落札額", "外注額"]) assert.ok(!html.includes(`>${name}</th>`));
  }
});
