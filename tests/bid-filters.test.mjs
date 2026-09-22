import assert from "node:assert/strict";
import { after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ configFile: false, appType: "custom", root, server: { middlewareMode: true } });
const { bidFilter } = await vite.ssrLoadModule("/lib/bid-filters.ts");
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE bids (id TEXT, title TEXT, agency TEXT, region TEXT, deadline TEXT, status TEXT, assignee TEXT)");
const insert = db.prepare("INSERT INTO bids VALUES (?, ?, ?, ?, ?, ?, ?)");
for (const row of [
  ["today", "DX研修", "機関A", "滋賀", "2026-09-11", "new", "a@example.test"],
  ["last", "Web制作", "機関B", "京都", "2026-09-18", "preparing", "b@example.test"],
  ["future", "Web運用", "機関B", "京都", "2026-09-19", "reviewing", "a@example.test"],
  ["past", "動画制作", "機関A", "滋賀", "2026-09-10", "reviewing", "a@example.test"],
  ["unknown", "100% 業務改善", "機関A", "滋賀", "", "new", "a@example.test"],
  ["submitted", "DX研修", "機関A", "滋賀", "2026-09-12", "submitted", "a@example.test"],
]) insert.run(...row);
after(async () => { db.close(); await vite.close(); });
function find(params) {
  const {condition, args} = bidFilter(new URLSearchParams(params), "2026-09-11");
  return db.prepare(`SELECT id FROM bids WHERE ${condition} ORDER BY id`).all(...args).map(row => row.id);
}
test("7-day priority queue includes today and day 7, excludes submitted and unknown deadlines", () => {
  assert.deepEqual(find({status:"active",deadline:"soon"}), ["last", "today"]);
});
test("overdue and missing deadlines are distinct; status filters can be cleared", () => {
  assert.deepEqual(find({status:"active",deadline:"overdue"}), ["past"]);
  assert.deepEqual(find({status:"active",deadline:"unknown"}), ["unknown"]);
  assert.deepEqual(find({status:"submitted"}), ["submitted"]);
  assert.equal(find({}).length, 6);
});
test("keyword, owner and workflow filters combine, and wildcard characters stay literal", () => {
  assert.deepEqual(find({q:"京都",assignee:"b@example.test",status:"preparing"}), ["last"]);
  assert.deepEqual(find({q:"%"}), ["unknown"]);
  assert.deepEqual(find({q:"' OR 1=1 --"}), []);
});
