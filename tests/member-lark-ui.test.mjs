import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { createServer } from "vite";
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ configFile: false, appType: "custom", root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement, Node: window.Node, Event: window.Event, MutationObserver: window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
const { MemberLarkSettingsPanel } = await vite.ssrLoadModule("/app/member-lark-settings.tsx");
const { MembershipSettings } = await vite.ssrLoadModule("/app/portal-membership.tsx");
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await vite.close(); });
const mount = async props => { const result = createRoot(document.getElementById("root")); await act(async () => result.render(React.createElement(MemberLarkSettingsPanel, props))); return result; };
test("Base connect saves the selected member URL and opens that member's setup without claiming a live connection", async () => {
  const account = { id: "selected-account", loginId: "member", name: "テスト 会員", active: 1, larkBaseUrl: "https://member.jp.larksuite.com/base/memberBase", larkConfigured: false };
  const writes = [];
  window.HTMLElement.prototype.scrollIntoView = function () {};
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === "PATCH") writes.push(JSON.parse(init.body));
    assert.notEqual(init.method, "POST", "opening setup must not create accounts or pretend to connect");
    return Response.json(url === "/api/member-accounts" ? { accounts: [account] } : { configured: false, owner: false, revision: "", templateUrl: "" });
  };
  const mounted = createRoot(document.getElementById("root"));
  try {
    await act(async () => mounted.render(React.createElement(MembershipSettings, { session: { role: "owner", user: { name: "管理者" } }, signInUrl: "/login" })));
    const row = document.querySelector('.membership-account');
    const button = row.querySelector('.membership-base-input-row button');
    assert.equal(button.textContent, "接続");
    await act(async () => button.click());
    assert.deepEqual(writes, [{ id: account.id, action: "lark-url", larkBaseUrl: account.larkBaseUrl }]);
    assert.equal(row.open, true); assert.equal(row.querySelector('.tool-disclosure').open, true);
    assert.match(row.textContent, /URL保存済み・接続未設定/);
    assert.equal(document.querySelector('.membership-create .membership-base-input-row button').disabled, true);
    assert.equal(document.querySelector('form form'), null);
  } finally { await act(async () => mounted.unmount()); }
});
test("member setup clearly requests a template copy, four table links and a separate secret without exposing SFL", async () => {
  globalThis.fetch = async () => Response.json({ configured: false, owner: false, revision: "", templateUrl: "" });
  const mounted = await mount({});
  try {
    assert.match(document.body.textContent, /テンプレート.*複製/); assert.match(document.body.textContent, /リンクは準備中/);
    assert.equal(document.querySelectorAll('input[type="url"]').length, 4);
    const secret = document.querySelector('input[type="password"]'); assert.ok(secret); assert.equal(secret.value, "");
    assert.match(document.body.textContent, /ログインID・パスワードとは異なります/);
    assert.equal(document.querySelector('a[href*="EvGnwALQmi1uRLkhTjNjx5N0pJh"]'), null);
    assert.equal(document.querySelector('form form'), null);
  } finally { await act(async () => mounted.unmount()); }
});
test("assisted setup loads only the selected account and preserves a secret without returning it to the form", async () => {
  const urls = { sfl: "https://a.jp.larksuite.com/base/baseA?table=tblAsfl", engineer: "https://a.jp.larksuite.com/base/baseA?table=tblAengineer", academy: "https://a.jp.larksuite.com/base/baseA?table=tblAacademy" };
  const data = { configured: true, owner: false, appId: "cli_memberA", revision: "fixture-revision", templateUrl: "https://template.jp.larksuite.com/base/template", targets: Object.fromEntries(Object.entries(urls).map(([mode, url]) => [mode, { name: mode, tableId: "tblA" + mode, url }])) };
  let submitted, notification = 0;
  const notify = () => notification++;
  window.addEventListener("lark-connection-changed", notify);
  globalThis.fetch = async (url, init = {}) => { assert.equal(url, "/api/lark/member-connection?accountId=selected-account"); if (init.method === "POST") submitted = JSON.parse(init.body); return Response.json(data); };
  const mounted = await mount({ accountId: "selected-account", accountName: "A" });
  try {
    assert.match(document.body.textContent, /AさんのLark接続/); assert.match(document.body.textContent, /登録先を設定済み/);
    assert.equal(document.querySelector('input[type="password"]').value, "");
    assert.equal(document.querySelectorAll('.member-lark-targets a').length, 3);
    await act(async () => document.querySelector('form').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    assert.deepEqual(submitted, { revision: data.revision, appId: data.appId, urls: { ...urls, free: "" } });
    assert.equal(notification, 1); assert.match(document.body.textContent, /接続設定を保存しました/);
  } finally { await act(async () => mounted.unmount()); window.removeEventListener("lark-connection-changed", notify); }
});
test("only an owner explicitly reveals a password, and hiding or leaving the page clears it", async t => {
  const account = { id: "credential-account", loginId: "member-login", name: "テスト 会員", active: 1, larkBaseUrl: "", larkConfigured: false };
  let reads = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (url === "/api/member-accounts/credentials") {
      reads++; assert.equal(init.method, "POST"); assert.equal(init.cache, "no-store");
      assert.deepEqual(JSON.parse(init.body), { id: account.id });
      return Response.json({ loginId: account.loginId, password: "Fixture-secret-only-2026" });
    }
    return Response.json(url === "/api/member-accounts" ? { accounts: [account] } : { owner: false, configured: false, revision: "", templateUrl: "" });
  };
  const mounted = createRoot(document.getElementById("root"));
  try {
    await act(async () => mounted.render(React.createElement(MembershipSettings, { session: { role: "owner", user: { name: "管理者" } }, signInUrl: "/login" })));
    const section = document.querySelector('[aria-label="会員のログイン情報"]'), button = section.querySelector('button');
    assert.equal(reads, 0); assert.equal(section.querySelectorAll('input').length, 1);
    await act(async () => button.click());
    assert.equal(reads, 1); assert.equal(section.querySelectorAll('input')[1].value, "Fixture-secret-only-2026");
    await act(async () => button.click()); assert.equal(section.querySelectorAll('input').length, 1);
    await act(async () => button.click());
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => document.dispatchEvent(new window.Event("visibilitychange")));
    assert.equal(section.querySelectorAll('input').length, 1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    t.mock.timers.enable({ apis: ["setTimeout"] });
    await act(async () => button.click());
    await act(async () => t.mock.timers.tick(60001));
    assert.equal(section.querySelectorAll('input').length, 1);
    t.mock.timers.reset();
    await act(async () => mounted.render(React.createElement(MembershipSettings, { session: { role: "member", user: { name: "会員" } }, signInUrl: "/login" })));
    assert.equal(document.querySelector('[aria-label="会員のログイン情報"]'), null);
  } finally { t.mock.timers.reset(); await act(async () => mounted.unmount()); }
});
