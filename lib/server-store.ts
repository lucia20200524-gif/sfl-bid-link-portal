import { env } from "cloudflare:workers";
import { z } from "zod";
import { workflowSchema } from "./procurement-workbench";
import { guestActorId } from "./guest-session";
import { bidSchema, canonicalUrl, dateOffset, todayJst, weekStart, type Bid, type BidInput, type Member } from "./bid-domain";

type Bindings = { DB: D1Database; BID_OWNER_EMAIL?: string };
export function bindings() { return env as unknown as Bindings; }
export function db() { const value = bindings().DB; if (!value) throw new ApiError(503, "共有データの準備ができていません。管理者にお問い合わせください。"); return value; }
export class ApiError extends Error { constructor(public status: number, message: string, public code = "") { super(message); } }
export type Actor = { id: string; email: string; name: string; role: "owner" | "member" | "guest" };
export async function requireMember(request: Request): Promise<Actor> {
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!id || !email) return { id: guestActorId(request), email: "", name: "ゲスト", role: "guest" };
  const owner = bindings().BID_OWNER_EMAIL?.trim().toLowerCase();
  if (!owner) throw new ApiError(503, "管理者の設定が完了していません。");
  if (email === owner) {
    await db().prepare("INSERT INTO bid_members (email, user_id, name, role, created_at) VALUES (?, ?, ?, 'owner', ?) ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id, role = 'owner'").bind(email, id, "小寺 健太", Date.now()).run();
  } else {
    // Open enrollment: any authenticated ChatGPT account can join as a member.
    // Preserve existing names and identity bindings; never grant administration.
    let name = email;
    const encodedName = request.headers.get("oai-authenticated-user-full-name");
    if (encodedName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
      try { name = decodeURIComponent(encodedName).trim().slice(0, 100) || email; } catch { /* Use email when the optional name is malformed. */ }
    }
    await db().prepare("INSERT INTO bid_members (email, user_id, name, role, created_at) VALUES (?, ?, ?, 'member', ?) ON CONFLICT(email) DO NOTHING").bind(email, id, name, Date.now()).run();
  }
  const member = await db().prepare("SELECT email, user_id, name, role FROM bid_members WHERE email = ?").bind(email).first<{ email: string; user_id: string | null; name: string; role: "owner" | "member" }>();
  if (!member || (member.user_id && member.user_id !== id)) throw new ApiError(403, "アカウント情報を確認できませんでした。管理者にお問い合わせください。", "membership");
  if (!member.user_id) {
    const bound = await db().prepare("UPDATE bid_members SET user_id = ? WHERE email = ? AND user_id IS NULL RETURNING user_id").bind(id, email).first<{ user_id: string }>();
    if (!bound) {
      const current = await db().prepare("SELECT user_id FROM bid_members WHERE email = ?").bind(email).first<{ user_id: string }>();
      if (current?.user_id !== id) throw new ApiError(403, "メンバー情報を確認してください。");
    }
  }
  return { id, email, name: member.name, role: email === owner ? "owner" : "member" };
}
export function checkMutation(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site" || (origin && origin !== new URL(request.url).origin)) throw new ApiError(403, "この操作はアプリの画面から実行してください。");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ApiError(415, "送信形式を確認してください。");
}
export async function jsonBody(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 50000) throw new ApiError(413, "入力内容が長すぎます。");
  const content = await request.text();
  if (content.length > 50000) throw new ApiError(413, "入力内容が長すぎます。");
  try { return JSON.parse(content); } catch { throw new ApiError(400, "入力内容を確認してください。"); }
}
export function reply(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } }); }
export function failure(error: unknown) {
  if (error instanceof ApiError) return reply({ error: error.message, code: error.code }, error.status);
  if (error instanceof z.ZodError) return reply({ error: error.issues[0]?.message ?? "入力内容を確認してください。" }, 400);
  console.error("bid-app request failed", error instanceof Error ? error.message : "unknown");
  return reply({ error: "処理できませんでした。入力内容はそのままで、時間をおいて再度お試しください。" }, 500);
}
export const columns = `id, title, agency, region, deadline, announced_on AS announcedOn, contract_method AS contractMethod, budget, qualifications, summary, match_reason AS matchReason, concerns, official_url AS officialUrl, fit, status, assignee, notes, submitted_on AS submittedOn, source, created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt, revision, workflow`;
export async function listMembers() { const r = await db().prepare("SELECT email, name, role FROM bid_members ORDER BY role DESC, created_at ASC").all<Member>(); return r.results; }
export async function findBid(id: string) { return db().prepare(`SELECT ${columns} FROM bids WHERE id = ?`).bind(id).first<Bid>(); }
export async function dedupeKey(input: BidInput) {
  const source = [input.title.normalize("NFKC").replace(/\s/g, "").toLowerCase(), input.agency.normalize("NFKC").replace(/\s/g, "").toLowerCase(), input.deadline].join("|");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function validateAssignee(input: BidInput) {
  if (!input.assignee) return;
  if (!await db().prepare("SELECT email FROM bid_members WHERE email = ?").bind(input.assignee).first()) throw new ApiError(400, "担当者が見つかりません。選び直してください。");
}
export async function saveBid(input: unknown, actor: Actor, existing?: { id: string; revision: number }) {
  const v = bidSchema.parse(input);
  try { v.workflow = JSON.stringify(workflowSchema.parse(JSON.parse(v.workflow))); } catch { throw new ApiError(400,"作業・結果の入力内容を確認してください。"); }
  await validateAssignee(v);
  v.officialUrl = v.officialUrl ? canonicalUrl(v.officialUrl) : "";
  const key = await dedupeKey(v);
  const duplicate = await db().prepare("SELECT id FROM bids WHERE dedupe_key = ? AND id != ?").bind(key, existing?.id ?? "").first<{id: string}>();
  if (duplicate) throw new ApiError(409, "同じ案件名・発注機関・締切の案件が登録済みです。案件一覧を確認してください。", "duplicate");
  const now = Date.now();
  const values = [v.title, v.agency, v.region, v.deadline, v.announcedOn, v.contractMethod, v.budget, v.qualifications, v.summary, v.matchReason, v.concerns, v.officialUrl, v.fit, v.status, v.assignee, v.notes, v.submittedOn, key, v.workflow];
  if (existing) {
    const result = await db().prepare(`UPDATE bids SET title=?, agency=?, region=?, deadline=?, announced_on=?, contract_method=?, budget=?, qualifications=?, summary=?, match_reason=?, concerns=?, official_url=?, fit=?, status=?, assignee=?, notes=?, submitted_on=?, dedupe_key=?, workflow=?, updated_at=?, revision=revision+1 WHERE id=? AND revision=? RETURNING ${columns}`).bind(...values, now, existing.id, existing.revision).first<Bid>();
    if (!result) throw new ApiError(409, "ほかのメンバーが更新しました。一覧を更新してから開き直してください。入力内容はこの画面に残っています。", "conflict");
    return result;
  }
  const id = crypto.randomUUID();
  try {
    await db().prepare("INSERT INTO bids (title,agency,region,deadline,announced_on,contract_method,budget,qualifications,summary,match_reason,concerns,official_url,fit,status,assignee,notes,submitted_on,dedupe_key,workflow,id,source,created_by,created_at,updated_at,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)").bind(...values,id,"manual",actor.id,now,now).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new ApiError(409, "同じ案件がすでに登録されています。", "duplicate");
    throw e;
  }
  return findBid(id);
}
export async function dashboardData() {
  const today=todayJst(), week=weekStart(today), month=today.slice(0,7)+"-01", soon=dateOffset(today,7);
  const stats = await db().prepare("SELECT SUM(CASE WHEN status IN ('new','reviewing','preparing') THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status IN ('new','reviewing','preparing') AND deadline >= ? AND deadline <= ? THEN 1 ELSE 0 END) AS dueSoon, SUM(CASE WHEN submitted_on >= ? AND submitted_on <= ? THEN 1 ELSE 0 END) AS weekly, SUM(CASE WHEN submitted_on >= ? AND submitted_on <= ? THEN 1 ELSE 0 END) AS monthly FROM bids").bind(today,soon,week,today,month,today).first<Record<string,number|null>>();
  const deadlines=await db().prepare(`SELECT ${columns} FROM bids WHERE status IN ('new','reviewing','preparing') ORDER BY CASE WHEN deadline='' THEN 1 ELSE 0 END, deadline ASC LIMIT 6`).all<Bid>();
  const counts=await db().prepare("SELECT status, COUNT(*) AS count FROM bids GROUP BY status").all();
  return { active:stats?.active??0,dueSoon:stats?.dueSoon??0,weekly:stats?.weekly??0,monthly:stats?.monthly??0,deadlines:deadlines.results,statusCounts:counts.results };
}
