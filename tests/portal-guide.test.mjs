import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ configFile: false, appType: "custom", root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { portalGuide } = await vite.ssrLoadModule("/lib/portal-guide.ts");
const base = { view: "collected", mode: "sfl", sourceId: "kkj", authenticated: true, authLoading: false, owner: false, loading: false, failed: false, partial: false, attempted: false, hasResults: false };

test("guidance follows the active audience and never treats failed or ongoing searches as completed results", () => {
  for (const [mode, hint] of [["sfl", "AI・DX研修"], ["engineer", "システム開発"], ["academy", "物品・印刷・清掃"]]) {
    const context = { ...base, mode };
    assert.ok(portalGuide(context).message.includes(hint));
    const loading = portalGuide({ ...context, loading: true, failed: true, hasResults: true });
    assert.equal(loading.state, "searching");
    assert.ok(loading.steps.every(step => !step.action));
    const failure = portalGuide({ ...context, failed: true, attempted: true, hasResults: true });
    assert.equal(failure.state, "failed");
    assert.match(failure.message, /0件という意味ではありません/);
    assert.equal(portalGuide({ ...context, attempted: true, hasResults: true }).state, "results");
    assert.match(portalGuide({ ...context, attempted: true, partial: true }).message, /検索先全体が0件という意味ではありません/);
  }
});

test("external-only searches and guests receive instructions matching their available actions", () => {
  const external = portalGuide({ ...base, sourceId: "p-portal", attempted: true });
  assert.equal(external.state, "external");
  assert.doesNotMatch(JSON.stringify(external), /Larkへ登録/);
  assert.match(JSON.stringify(external), /公式サイト側で設定/);
  const guest = portalGuide({ ...base, authenticated: false });
  assert.equal(guest.state, "welcome");
  assert.deepEqual(guest.steps.flatMap(step => step.action ? [step.action.target] : []), [{ view: "collected" }, { view: "links" }]);
  assert.match(portalGuide({ ...base, view: "settings", owner: false }).message, /管理者に依頼/);
  assert.match(portalGuide({ ...base, view: "settings", owner: true }).message, /接続を確認/);
});

test("guide shortcuts have real focusable destinations in all three audience forms and result tables", async () => {
  const { default: Form } = await vite.ssrLoadModule("/app/collection-search-form.tsx");
  const { default: Results } = await vite.ssrLoadModule("/app/collection-table.tsx");
  const { collectionModes } = await vite.ssrLoadModule("/lib/collection-profiles.ts");
  const callbacks = { onChange() {}, onGenerate() {}, onSubmit() {}, onKeywords() {}, onCopyKeywords() {} };
  for (const mode of collectionModes) {
    const form = renderToStaticMarkup(React.createElement(Form, { mode, fields: { keyword: mode.defaultKeyword, keywordGroup: "recommended", sourceId: "kkj", scope: "fulltext" }, loading: false, anyCollecting: false, error: "", ...callbacks }));
    const results = renderToStaticMarkup(React.createElement(Results, { mode: mode.id, result: { items: [], sources: [] }, loading: false, error: "", onRegister() {} }));
    assert.match(form, new RegExp(`<textarea[^>]*id="collection-keywords-${mode.id}"`));
    assert.match(form, new RegExp(`<fieldset[^>]*id="collection-sources-${mode.id}"[^>]*tabindex="-1"`));
    assert.match(results, new RegExp(`<section[^>]*id="collection-results-${mode.id}"[^>]*tabindex="-1"`));
    for (const step of portalGuide({ ...base, mode: mode.id }).steps) {
      assert.ok((form + results).includes(`id="collection-${step.action.target.anchor}-${mode.id}"`));
    }
  }
});

test("the character opens native in-page guidance without a modal or a chat input", async () => {
  const { default: Navigator } = await vite.ssrLoadModule("/app/portal-navigator.tsx");
  const html = renderToStaticMarkup(React.createElement(Navigator, { context: base, onNavigate() {} }));
  assert.match(html, /<details[^>]*class="portal-navigator"/);
  assert.match(html, /<summary/);
  assert.match(html, /src="\/sfl-anime-navigator.png"/);
  assert.match(html, /src="\/sfl-male-navigator.png"/);
  assert.doesNotMatch(html, /src="\/sfl-crystal-navigator.png"|aria-label="アニメ"/);
  assert.equal((html.match(/role="radio"/g)||[]).length,2);
  assert.match(html, /aria-label="男性"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="男性"/);
  assert.match(html, /案内ナビゲーター/);
  assert.match(html, /使い方を見る/);
  assert.doesNotMatch(html, /role="dialog"|<textarea|<input[^>]*type="(?:text|search)"/);
});
