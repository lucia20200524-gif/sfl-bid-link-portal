import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ configFile: false, appType: "custom", root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const tools = await vite.ssrLoadModule("/lib/bid-practice.ts");

test("participation stays unresolved without both the content and its source", () => {
  const draft = tools.createPracticeDraft();
  const values = Object.values(draft.checks);
  assert.deepEqual(tools.reviewSummary(values), { total: 8, confirmed: 0, mismatch: 0, remaining: 8 });
  values[0].status = "confirmed";
  assert.equal(tools.reviewSummary(values).confirmed, 0);
  values[0].content = "資格の種類・有効期間を照合";
  values[0].source = "公告 p.2";
  values[1].status = "mismatch";
  values[2].status = "not-required";
  assert.deepEqual(tools.reviewSummary(values), { total: 8, confirmed: 1, mismatch: 1, remaining: 6 });
  assert.match(tools.practiceReport("participation-check", draft), /内容・根拠の記入が必要/);
});
test("estimate includes direct costs, reserves, and internal labor", () => {
  const input = { ...tools.createPracticeDraft().costs, revenue: "300000", purchase: "30000", outsource: "80000", shipping: "5000", travel: "10000", other: "5000", reserve: "10000", hours: "20", rate: "3000" };
  const result = tools.calculateEstimate(input);
  assert.equal(result.ready, true);
  assert.equal(result.cashCosts, 140000);
  assert.equal(result.labor, 60000);
  assert.equal(result.total, 200000);
  assert.equal(result.balance, 100000);
  assert.ok(Math.abs(result.margin - 100 / 3) < 0.00001);
  assert.equal(tools.calculateEstimate({ ...input, revenue: "100000" }).balance, -100000);
  assert.equal(tools.calculateEstimate({ ...input, revenue: "200000" }).balance, 0);
});
test("invalid, absent, negative and partially specified inputs do not yield a usable estimate", () => {
  const empty = tools.createPracticeDraft().costs;
  for (const patch of [{}, { revenue: "0" }, { revenue: "-1" }, { revenue: "Infinity" }, { revenue: "100000", hours: "10" }, { revenue: "100000", rate: "3000" }, { revenue: "100000", shipping: "-3" }, { revenue: "100000", other: "1,000" }, { revenue: "100000", hours: "100001", rate: "1" }]) {
    assert.equal(tools.calculateEstimate({ ...empty, ...patch }).ready, false, JSON.stringify(patch));
  }
  assert.equal(tools.calculateEstimate({ ...empty, revenue: "1", other: "0.1", shipping: "0.2" }).balance, 0.7);
});
test("report includes source evidence and all cost inputs; links only allow web URLs", () => {
  const draft = tools.createPracticeDraft();
  draft.title = "研修の実施"; draft.questions = "報告書の様式を確認";
  draft.documents.scope = { status: "confirmed", content: "研修3回", source: "仕様書 p.3" };
  const report = tools.practiceReport("document-review", draft);
  assert.match(report, /研修3回/); assert.match(report, /仕様書 p.3/); assert.match(report, /報告書の様式/);
  draft.costs.revenue = "300000"; draft.costs.hours = "20"; draft.costs.rate = "3000";
  assert.match(tools.practiceReport("cost-simulator", draft), /240,000円/);
  for (const url of ["javascript:alert(1)", "data:text/html,x", "https://user:pass@example.org/", "bad"]) assert.equal(tools.officialUrl(url), null);
  assert.equal(tools.officialUrl("https://example.org/notice"), "https://example.org/notice");
});
test("each tool renders a usable form, export actions and no invented completed result", async () => {
  const { default: Tool } = await vite.ssrLoadModule("/app/bid-practice-tools.tsx");
  for (const view of tools.practiceViews) {
    const html = renderToStaticMarkup(React.createElement(Tool, { view, draft: tools.createPracticeDraft(), setDraft() {} }));
    assert.match(html, /案件名/); assert.match(html, /結果をコピー/); assert.match(html, /テキストを書き出す/);
    assert.match(html, /再読み込み/); assert.doesNotMatch(html, /参加できます|自動解析済/);
    if (view === "cost-simulator") assert.match(html, /disabled=""/);
    else assert.match(html, /根拠の資料名・ページ/);
  }
});
