import { z } from "zod";
import { ApiError, db, listMembers, requireMember, type Actor } from "./server-store";
import { hashMemberPassword, memberTokenHash, randomMemberToken, verifyMemberPassword } from "./member-password";
import type { Session } from "./bid-domain";
import { encryptMemberCredential, decryptMemberCredential } from "./member-credential";
import { memberBaseUrlInput, parseLarkBaseUrl, type LarkDestinations } from "./lark-destination";

const cookieName = "__Host-bid-member";
const sessionSeconds = 7 * 24 * 60 * 60;
export const loginIdSchema = z.string().trim().min(3, "ログインIDは3文字以上で入力してください。").max(64).regex(/^[a-zA-Z0-9._-]+$/, "ログインIDは半角英数字・ピリオド・ハイフン・アンダーバーで入力してください。").transform(value => value.toLowerCase());
export const passwordSchema = z.string().min(12, "パスワードは12文字以上で設定してください。").max(128, "パスワードは128文字以内で設定してください。");
export const accountInput = z.object({ loginId: loginIdSchema, name: z.string().trim().min(1, "氏名を入力してください。").max(100), password: passwordSchema, larkBaseUrl: memberBaseUrlInput });
type Account = { id: string; loginId: string; name: string; active: number; passwordHash: string; credentialVersion: number };
const accountColumns = "id, login_id AS loginId, name, active, password_hash AS passwordHash, credential_version AS credentialVersion";
function storedToken(request: Request) {
  const value = (request.headers.get("cookie") || "").split(";").map(part => part.trim()).find(part => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function memberCookie(token: string, maxAge = sessionSeconds) {
  return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
async function accountForRequest(request: Request) {
  const token = storedToken(request);
  if (!token) return null;
  return db().prepare(`SELECT a.id, a.login_id AS loginId, a.name FROM portal_accounts a JOIN portal_member_sessions s ON s.account_id=a.id AND s.credential_version=a.credential_version WHERE s.token_hash=? AND s.expires_at>? AND a.active=1`).bind(memberTokenHash(token), Date.now()).first<{ id: string; loginId: string; name: string }>();
}
export async function workspaceSession(request: Request): Promise<Session> {
  const identity = await requireMember(request);
  if (identity.role === "owner") return { user: identity, role: "owner", members: await listMembers(), membership: { allowed: true, kind: "owner" } };
  const account = await accountForRequest(request);
  if (account) return { user: { id: `account:${account.id}`, name: account.name, email: "" }, role: "member", members: await listMembers(), membership: { allowed: true, kind: "member", loginId: account.loginId } };
  return { user: identity, role: identity.role, members: [], membership: { allowed: false, kind: null } };
}
export async function requireSearchMember(request: Request): Promise<Actor> {
  const identity = await requireMember(request);
  if (identity.role === "owner") return identity;
  const account = await accountForRequest(request);
  if (!account) throw new ApiError(401, "案件検索・確認を利用するには、会員ログインしてください。", "member_login_required");
  return { id: `account:${account.id}`, email: "", name: account.name, role: "member" };
}
export async function requireAccountOwner(request: Request) {
  const actor = await requireMember(request);
  if (actor.role !== "owner") throw new ApiError(403, "会員の管理は管理者のみ操作できます。");
  return actor;
}
async function consumeAttempt(key: string, limit: number, duration: number, now: number) {
  const value = await db().prepare(`INSERT INTO portal_login_limits (key, attempts, expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`).bind(memberTokenHash(key), now + duration, now, now).first<{ attempts: number }>();
  if (!value || value.attempts > limit) throw new ApiError(429, "ログインの試行回数が多くなっています。15分ほど待ってから、もう一度お試しください。");
}
export async function loginMember(request: Request, input: unknown) {
  const value = z.object({ loginId: loginIdSchema, password: z.string().min(1).max(128) }).parse(input);
  const now = Date.now();
  // Consume counters atomically before expensive password work. No raw IPs or
  // attempted IDs are retained, and missing proxy IPs share a bounded bucket.
  await consumeAttempt("global", 120, 60_000, now);
  await consumeAttempt(`ip:${request.headers.get("cf-connecting-ip") || "unavailable"}`, 60, 900_000, now);
  await consumeAttempt(`id:${value.loginId}`, 8, 900_000, now);
  await db().prepare("DELETE FROM portal_login_limits WHERE key IN (SELECT key FROM portal_login_limits WHERE expires_at<? LIMIT 500)").bind(now).run();
  const account = await db().prepare(`SELECT ${accountColumns} FROM portal_accounts WHERE login_id=?`).bind(value.loginId).first<Account>();
  const valid = await verifyMemberPassword(value.password, account?.passwordHash ?? null);
  if (!valid || !account?.active) throw new ApiError(401, "ログインIDまたはパスワードを確認してください。", "invalid_credentials");
  const token = randomMemberToken();
  // Version match also closes the race with account suspension/password reset.
  const created = await db().prepare("INSERT INTO portal_member_sessions (token_hash,account_id,credential_version,created_at,expires_at) SELECT ?,id,credential_version,?,? FROM portal_accounts WHERE id=? AND active=1 AND credential_version=? RETURNING token_hash").bind(memberTokenHash(token), now, now + sessionSeconds * 1000, account.id, account.credentialVersion).first();
  if (!created) throw new ApiError(401, "ログインIDまたはパスワードを確認してください。", "invalid_credentials");
  await logoutMember(request);
  await db().prepare("DELETE FROM portal_member_sessions WHERE token_hash IN (SELECT token_hash FROM portal_member_sessions WHERE expires_at<? LIMIT 500)").bind(now).run();
  return token;
}
export async function logoutMember(request: Request) {
  const token = storedToken(request);
  if (token) await db().prepare("DELETE FROM portal_member_sessions WHERE token_hash=?").bind(memberTokenHash(token)).run();
}
export async function listAccounts() {
  const { results } = await db().prepare("SELECT a.id,a.login_id AS loginId,a.name,a.active,a.created_at AS createdAt,a.lark_base_url AS larkBaseUrl,c.targets_json AS targetsJson FROM portal_accounts a LEFT JOIN member_lark_connections c ON c.user_id='account:' || a.id ORDER BY a.created_at DESC,a.id").all<{ id: string; loginId: string; name: string; active: number; createdAt: number; larkBaseUrl: string; targetsJson: string | null }>();
  return results.map(({ targetsJson, ...account }) => ({ ...account, larkConfigured: Boolean(targetsJson), ...(targetsJson ? { larkBaseUrl: parseLarkBaseUrl((JSON.parse(targetsJson) as LarkDestinations).sfl.url).baseUrl } : {}) }));
}
export async function createAccount(input: unknown) {
  const value = accountInput.parse(input);
  if (await db().prepare("SELECT id FROM portal_accounts WHERE login_id=?").bind(value.loginId).first()) throw new ApiError(409, "このログインIDは使用されています。別のIDを入力してください。");
  const id = crypto.randomUUID(), hash = await hashMemberPassword(value.password);
  const cipher = await encryptMemberCredential(value.password, id);
  const created = await db().prepare("INSERT INTO portal_accounts (id,login_id,name,password_hash,credential_cipher,active,credential_version,lark_base_url,created_at,updated_at) VALUES (?,?,?,?,?,1,1,?,?,?) ON CONFLICT(login_id) DO NOTHING RETURNING id").bind(id, value.loginId, value.name, hash, cipher, value.larkBaseUrl, Date.now(), Date.now()).first();
  if (!created) throw new ApiError(409, "このログインIDは使用されています。別のIDを入力してください。");
}
export async function updateAccount(input: unknown) {
  const value = z.discriminatedUnion("action", [z.object({ action: z.literal("status"), id: z.string().uuid(), active: z.boolean() }), z.object({ action: z.literal("password"), id: z.string().uuid(), password: passwordSchema }), z.object({ action: z.literal("lark-url"), id: z.string().uuid(), larkBaseUrl: memberBaseUrlInput })]).parse(input);
  if (value.action === "lark-url") {
    // Saving a URL is metadata only. A working connection must be changed via
    // its revision-checked setup flow, never by replacing this unverified URL.
    const saved = await db().prepare("UPDATE portal_accounts SET lark_base_url=?,updated_at=? WHERE id=? AND NOT EXISTS (SELECT 1 FROM member_lark_connections WHERE user_id='account:' || portal_accounts.id) RETURNING id").bind(value.larkBaseUrl, Date.now(), value.id).first();
    if (!saved) {
      if (!await db().prepare("SELECT id FROM portal_accounts WHERE id=?").bind(value.id).first()) throw new ApiError(404, "会員が見つかりません。画面を更新してください。");
      throw new ApiError(409, "接続済みです。登録先の変更は「この会員のLark接続を設定」から行ってください。");
    }
    return;
  }
  const hash = value.action === "password" ? await hashMemberPassword(value.password) : null;
  const cipher = value.action === "password" ? await encryptMemberCredential(value.password, value.id) : null;
  const result = value.action === "password"
    ? await db().prepare("UPDATE portal_accounts SET password_hash=?,credential_cipher=?,credential_version=credential_version+1,updated_at=? WHERE id=? RETURNING id").bind(hash, cipher, Date.now(), value.id).first()
    : await db().prepare("UPDATE portal_accounts SET active=?,credential_version=credential_version+1,updated_at=? WHERE id=? RETURNING id").bind(value.active ? 1 : 0, Date.now(), value.id).first();
  if (!result) throw new ApiError(404, "会員が見つかりません。画面を更新してください。");
  await db().prepare("DELETE FROM portal_member_sessions WHERE account_id=?").bind(value.id).run();
}
export async function revealMemberCredential(request: Request, input: unknown) {
  const actor = await requireAccountOwner(request);
  const { id } = z.object({ id: z.string().uuid() }).parse(input);
  await consumeAttempt(`credential-view:${actor.id}`, 30, 60_000, Date.now());
  const account = await db().prepare("SELECT login_id AS loginId,credential_cipher AS cipher FROM portal_accounts WHERE id=?").bind(id).first<{ loginId: string; cipher: string }>();
  if (!account) throw new ApiError(404, "会員が見つかりません。");
  if (!account.cipher) return { loginId: account.loginId, password: null, message: "以前に登録したパスワードは復元できません。下の再設定を行うと、以後ここで確認できます。" };
  const password = await decryptMemberCredential(account.cipher, id);
  await db().prepare("INSERT INTO portal_credential_views (id,account_id,viewed_by,viewed_at) VALUES (?,?,?,?)").bind(crypto.randomUUID(), id, actor.id, Date.now()).run();
  return { loginId: account.loginId, password };
}
