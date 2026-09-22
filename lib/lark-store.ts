import { ApiError, db, type Actor } from "./server-store";
import { todayJst } from "./bid-domain";
import { isFutureBidDeadline } from "./procurement-deadline";
import { LarkClient, LarkRequestError, larkRecordFields } from "./lark-client";
import { larkRegistrationKey, type LarkCandidate, type LarkRegistrationResult, type LarkRegistrationState } from "./lark-registration";
import { larkContext, scopedLarkKey } from "./member-lark-store";
import { destinationRecordUrl } from "./lark-destination";
import type { LarkMode } from "./collection-profiles";

type StoredRegistration = { key: string; mode: LarkMode; client_token: string; state: string; record_id: string; warnings: string; lease_token: string; locked_until: number };
const read = (key: string) => db().prepare("SELECT key, mode, client_token, state, record_id, warnings, lease_token, locked_until FROM lark_bid_registrations WHERE key = ?").bind(key).first<StoredRegistration>();
export async function registrationStatuses(mode: LarkMode, keys: string[], actor: Actor) {
  const registrations: Record<string, LarkRegistrationState> = {};
  let context;
  try { context = await larkContext(actor, mode); }
  catch (error) { if (error instanceof ApiError && error.code === "lark_setup") return { configured: false, message: error.message, registrations }; throw error; }
  const entries = await Promise.all(keys.map(async key => ({ key, scoped: await scopedLarkKey(context.scope, key) })));
  const originals = new Map(entries.map(entry => [entry.scoped, entry.key]));
  if (keys.length) {
    // D1 allows at most 100 bound parameters. Leave room for the mode filter.
    for (let offset = 0; offset < keys.length; offset += 90) {
      const chunk = entries.slice(offset, offset + 90).map(entry => entry.scoped);
      const result = await db().prepare(`SELECT key, state, record_id, warnings FROM lark_bid_registrations WHERE connection_scope = ? AND mode = ? AND key IN (${chunk.map(() => "?").join(",")})`).bind(context.scope, mode, ...chunk).all<StoredRegistration>();
      for (const row of result.results) {
        const key = originals.get(row.key)!;
        if (row.state === "registered" && row.record_id) registrations[key] = { state: "registered", recordUrl: destinationRecordUrl(context.targets[mode]!, row.record_id), warnings: JSON.parse(row.warnings) };
        else if (["sending", "uncertain"].includes(row.state)) registrations[key] = { state: "checking" };
      }
    }
  }
  return { configured: true, registrations, destination: context.targets[mode]!, destinationRevision: context.revision };
}

export async function registerInLark(mode: LarkMode, item: LarkCandidate, actor: Actor, destinationRevision?: string): Promise<LarkRegistrationResult> {
  const context = await larkContext(actor, mode);
  if ((actor.role !== "owner" || destinationRevision) && destinationRevision !== context.revision) throw new ApiError(409, "Larkの登録先が変更されています。画面を再読み込みして登録先を確認してください。", "lark_destination_changed");
  if (!isFutureBidDeadline(item.deadline, todayJst())) throw new ApiError(400, "提出期限が本日以前になっています。最新の案件を検索してください。");
  const key = await scopedLarkKey(context.scope, await larkRegistrationKey(mode, item)), now = Date.now();
  await db().prepare("INSERT INTO lark_bid_registrations (key, mode, client_token, created_by, updated_at, connection_scope) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO NOTHING").bind(key, mode, crypto.randomUUID(), actor.id, now, context.scope).run();
  let row = await read(key);
  const result = (recordId: string, warnings: string[], alreadyRegistered: boolean): LarkRegistrationResult => ({ registered: true, alreadyRegistered, recordUrl: destinationRecordUrl(context.targets[mode]!, recordId), targetName: context.targets[mode]!.name, warnings });
  if (row?.state === "registered" && row.record_id) return result(row.record_id, JSON.parse(row.warnings), true);
  const lease = crypto.randomUUID();
  const locked = await db().prepare("UPDATE lark_bid_registrations SET lease_token = ?, locked_until = ?, updated_at = ? WHERE key = ? AND locked_until <= ? RETURNING key").bind(lease, now + 90000, now, key, now).first();
  if (!locked) throw new ApiError(409, "この案件を登録処理中です。少し時間をおいて「登録を確認」を押してください。", "lark_processing");
  let sent = false;
  try {
    row = await read(key);
    if (!row) throw new ApiError(503, "登録状況を保存できませんでした。");
    if (row.state === "registered" && row.record_id) return result(row.record_id, JSON.parse(row.warnings), true);
    const client = await new LarkClient(context.connection).connect();
    const metadata = await client.fields(mode);
    const existing = await client.duplicate(mode, item);
    if (existing) {
      await db().prepare("UPDATE lark_bid_registrations SET state = 'registered', record_id = ?, updated_at = ? WHERE key = ? AND lease_token = ?").bind(existing.record_id, Date.now(), key, lease).run();
      return result(existing.record_id, JSON.parse(row.warnings), true);
    }
    // After a response was lost, looking up the existing row is safe. Sending a
    // second create request is not: retain this state for an operator to resolve.
    if (["sending", "uncertain"].includes(row.state)) throw new ApiError(409, "前回の登録結果をまだ確定できません。Larkの登録先を確認してください。重複を防ぐため、追加の送信はしていません。", "lark_uncertain");
    const mapped = larkRecordFields(item, metadata);
    if ((await larkContext(actor, mode)).revision !== context.revision) throw new ApiError(409, "接続設定が変更されたため登録を中止しました。画面を更新してください。", "lark_destination_changed");
    await db().prepare("UPDATE lark_bid_registrations SET state = 'sending', warnings = ?, updated_at = ? WHERE key = ? AND lease_token = ?").bind(JSON.stringify(mapped.warnings), Date.now(), key, lease).run();
    sent = true;
    const created = await client.create(mode, mapped.fields, row.client_token);
    await db().prepare("UPDATE lark_bid_registrations SET state = 'registered', record_id = ?, updated_at = ? WHERE key = ? AND lease_token = ?").bind(created.record_id, Date.now(), key, lease).run();
    return result(created.record_id, mapped.warnings, false);
  } catch (error) {
    if (sent) {
      const uncertain = !(error instanceof LarkRequestError) || error.uncertain;
      await db().prepare("UPDATE lark_bid_registrations SET state = ?, updated_at = ? WHERE key = ? AND lease_token = ?").bind(uncertain ? "uncertain" : "ready", Date.now(), key, lease).run();
      if (uncertain && !(error instanceof LarkRequestError)) throw new LarkRequestError("Larkへの登録後の確認が完了しませんでした。「登録を確認」を押してください。", true);
    }
    throw error;
  } finally {
    await db().prepare("UPDATE lark_bid_registrations SET locked_until = 0, lease_token = '' WHERE key = ? AND lease_token = ?").bind(key, lease).run();
  }
}
