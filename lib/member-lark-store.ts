import { env } from "cloudflare:workers";
import { ApiError, db, type Actor } from "./server-store";
import { LarkClient, larkConfigured, type LarkClientConnection } from "./lark-client";
import { decryptLarkSecret, encryptLarkSecret } from "./lark-secret";
import { larkModes, presetLarkModes, memberConnectionInput, type LarkDestinations, type MemberLarkSettings } from "./lark-destination";
import { larkBaseUrl, larkTableUrl, larkTargets, larkTargetNames, larkMemberTemplateUrl } from "./lark-registration";
import { z } from "zod";
import type { LarkMode } from "./collection-profiles";
const modeScope = (scope: string, targets: LarkDestinations, mode?: LarkMode) => mode === "free" ? `${scope}:free:${targets.free?.tableId ?? "unconfigured"}` : scope;

type Stored = { user_id: string; app_id: string; secret_cipher: string; base_token: string; targets_json: string; revision: string; checked_at: number };
export type LarkContext = { scope: string; revision: string; targets: LarkDestinations; connection?: LarkClientConnection };
const ownTargets = Object.fromEntries(presetLarkModes.map(mode => [mode, { name: larkTargets[mode].name, tableId: larkTargets[mode].tableId, url: larkTableUrl(mode) }])) as LarkDestinations;
const read = (userId: string) => db().prepare("SELECT user_id,app_id,secret_cipher,base_token,targets_json,revision,checked_at FROM member_lark_connections WHERE user_id=?").bind(userId).first<Stored>();
const memberScope = (actor: Actor, base: string, targets: LarkDestinations) => `member:${actor.id}:${base}:${presetLarkModes.map(mode => targets[mode].tableId).join(":")}`;
export async function connectionSubject(actor: Actor, accountId?: string | null) {
  if (!accountId) return actor;
  if (actor.role !== "owner") throw new ApiError(403, "他の会員のLark接続は変更できません。");
  const id = z.string().uuid().parse(accountId);
  const account = await db().prepare("SELECT id,name FROM portal_accounts WHERE id=? AND active=1").bind(id).first<{ id: string; name: string }>();
  if (!account) throw new ApiError(404, "利用中の会員が見つかりません。");
  return { id: `account:${account.id}`, name: account.name, email: "", role: "member" as const };
}
export async function templateUrl() {
  return (await db().prepare("SELECT url FROM lark_template_settings WHERE key='member-template'").bind().first<{ url: string }>())?.url ?? larkMemberTemplateUrl;
}
export async function saveTemplateUrl(input: unknown) {
  const value = z.object({ url: z.string().trim().max(2000), emptyTemplateConfirmed: z.literal(true, { errorMap: () => ({ message: "実案件を含まない配布用テンプレートであることを確認してください。" }) }) }).parse(input);
  if (value.url) {
    let url: URL;
    try { url = new URL(value.url); } catch { throw new ApiError(400, "Larkの共有URLを入力してください。"); }
    if (url.protocol !== "https:" || !/^[a-z0-9-]+(?:\.jp)?\.larksuite\.com$/.test(url.hostname) || url.port || url.username || url.password || !/^\/(?:base|wiki|share\/base)\/[a-zA-Z0-9]+\/?$/.test(url.pathname) || value.url.includes(new URL(larkBaseUrl).pathname.split("/").pop()!)) throw new ApiError(400, "運用中のBaseではなく、空の配布用テンプレートの共有URLを入力してください。");
    const ownToken = (env as { LARK_BASE_APP_TOKEN?: string }).LARK_BASE_APP_TOKEN;
    if (ownToken && value.url.includes(ownToken)) throw new ApiError(400, "運用中のBaseは配布用に設定できません。");
  }
  await db().prepare("INSERT INTO lark_template_settings (key,url,updated_at) VALUES ('member-template',?,?) ON CONFLICT(key) DO UPDATE SET url=excluded.url,updated_at=excluded.updated_at").bind(value.url, Date.now()).run();
}
export async function memberLarkSettings(actor: Actor): Promise<MemberLarkSettings> {
  const template = await templateUrl();
  if (actor.role === "owner") return { owner: true, configured: larkConfigured(), revision: "sfl-default", targets: ownTargets, templateUrl: template };
  const row = await read(actor.id);
  const saved = await db().prepare("SELECT lark_base_url AS url FROM portal_accounts WHERE 'account:' || id=?").bind(actor.id).first<{ url: string }>();
  return row ? { owner: false, configured: true, revision: row.revision, appId: row.app_id, targets: JSON.parse(row.targets_json), checkedAt: row.checked_at, templateUrl: template }
    : { owner: false, configured: false, revision: "", templateUrl: template, savedBaseUrl: saved?.url ?? "" };
}
// This inexpensive lookup is also used by search buckets. No credentials are
// decrypted and no other member's registration links or statuses are returned.
export async function larkScope(actor: Actor, mode?: LarkMode) {
  if (actor.role === "owner") return "sfl";
  const row = await db().prepare("SELECT base_token,targets_json FROM member_lark_connections WHERE user_id=?").bind(actor.id).first<{ base_token: string; targets_json: string }>();
  return row ? modeScope(memberScope(actor, row.base_token, JSON.parse(row.targets_json)), JSON.parse(row.targets_json), mode) : `unconfigured:${actor.id}`;
}
export async function scopedLarkKey(scope: string, key: string) {
  if (scope === "sfl") return key;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${scope}|${key}`));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function larkContext(actor: Actor, mode?: LarkMode): Promise<LarkContext> {
  if (actor.role === "owner") {
    if (mode === "free") throw new ApiError(409, "管理者のBaseにはフリーモード専用の登録先が未設定です。詳細画面で既存の保存先を選択してください。", "lark_setup");
    if (!larkConfigured()) throw new ApiError(503, "Larkの接続設定がまだ完了していません。", "lark_setup");
    return { scope: "sfl", revision: "sfl-default", targets: ownTargets };
  }
  const row = await read(actor.id);
  if (!row) throw new ApiError(409, "「設定」から、ご自身のLarkへの接続を設定してください。", "lark_setup");
  const targets = JSON.parse(row.targets_json) as LarkDestinations;
  if (mode === "free" && !targets.free) throw new ApiError(409, "接続設定に、複製したフリーモードのテーブルURLを追加してください。", "lark_setup");
  return { scope: modeScope(memberScope(actor, row.base_token, targets), targets, mode), revision: row.revision, targets, connection: { appId: row.app_id, appSecret: await decryptLarkSecret(row.secret_cipher, actor.id), baseToken: row.base_token, targets } };
}
export async function saveMemberLark(actor: Actor, input: unknown) {
  if (actor.role === "owner") throw new ApiError(400, "管理者自身はSFLの登録先を利用します。会員を選んで設定してください。");
  const value = memberConnectionInput.parse(input), previous = await read(actor.id);
  if (value.revision !== (previous?.revision ?? "")) throw new ApiError(409, "接続設定が更新されています。再読み込みしてから設定してください。");
  const e = env as { LARK_APP_ID?: string; LARK_BASE_APP_TOKEN?: string };
  if (value.appId === e.LARK_APP_ID) throw new ApiError(400, "SFLの運用アプリは使用できません。会員の組織で用意した連携アプリを指定してください。");
  const secret = value.appSecret ?? (previous?.app_id === value.appId ? await decryptLarkSecret(previous.secret_cipher, actor.id) : "");
  if (!secret) throw new ApiError(400, "LarkアプリのApp Secretを入力してください。");
  const cipher = await encryptLarkSecret(secret, actor.id);
  const connectedModes = larkModes.filter(mode => !!value.urls[mode]);
  const targets = Object.fromEntries(connectedModes.map(mode => [mode, { name: larkTargetNames[mode], tableId: value.urls[mode]!.tableId, url: value.urls[mode]!.url }])) as LarkDestinations;
  const source = value.urls.sfl;
  const client = await new LarkClient({ appId: value.appId, appSecret: secret, ...(source.kind === "base" ? { baseToken: source.token } : { wikiToken: source.token }), targets }).connect();
  const baseToken = client.resolvedBaseToken;
  if (baseToken === new URL(larkMemberTemplateUrl).pathname.split("/").pop()) throw new ApiError(400, "配布用テンプレートには登録できません。ご自身の複製先を指定してください。");
  const ownBaseToken = e.LARK_BASE_APP_TOKEN || (larkConfigured() ? (await new LarkClient().connect()).resolvedBaseToken : "");
  if (baseToken === ownBaseToken) throw new ApiError(400, "SFLの運用中のBaseには接続できません。ご自身の複製先を指定してください。");
  const assigned = await db().prepare("SELECT user_id FROM member_lark_connections WHERE base_token=? AND user_id<>?").bind(baseToken, actor.id).first();
  if (assigned) throw new ApiError(409, "このBaseは別の会員が使用しています。ご自身のLarkへ新しく複製してください。");
  for (const mode of connectedModes) await client.fields(mode);
  const revision = crypto.randomUUID(), now = Date.now();
  // Revision comparison and unique Base ownership also apply when two setup
  // requests finish concurrently. A failed check never replaces a working link.
  let saved;
  try {
    saved = previous
      ? await db().prepare("UPDATE member_lark_connections SET app_id=?,secret_cipher=?,base_token=?,targets_json=?,revision=?,checked_at=? WHERE user_id=? AND revision=? RETURNING revision").bind(value.appId, cipher, baseToken, JSON.stringify(targets), revision, now, actor.id, value.revision).first()
      : await db().prepare("INSERT INTO member_lark_connections (user_id,app_id,secret_cipher,base_token,targets_json,revision,checked_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING revision").bind(actor.id, value.appId, cipher, baseToken, JSON.stringify(targets), revision, now).first();
  } catch { throw new ApiError(409, "接続先の保存を完了できませんでした。再読み込みして設定をご確認ください。"); }
  if (!saved) throw new ApiError(409, "接続設定が更新されたか、登録先が使用中です。再読み込みしてください。");
  return memberLarkSettings(actor);
}
export async function disconnectMemberLark(actor: Actor, revision: string) {
  if (actor.role === "owner") throw new ApiError(400, "SFLの接続はここでは解除できません。");
  const removed = await db().prepare("DELETE FROM member_lark_connections WHERE user_id=? AND revision=? RETURNING user_id").bind(actor.id, revision).first();
  if (!removed) throw new ApiError(409, "接続設定が更新されています。再読み込みしてください。");
}
