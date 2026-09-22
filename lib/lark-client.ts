import { fetchWithoutRedirects } from "./http-fetch";
import { env } from "cloudflare:workers";
import { ApiError } from "./server-store";
import { canonicalUrl } from "./bid-domain";
import { larkTargets, larkWikiToken, normalizeLarkText, type LarkCandidate } from "./lark-registration";
import type { LarkMode } from "./collection-profiles";
import type { LarkDestinations } from "./lark-destination";
export type LarkClientConnection = { appId: string; appSecret: string; baseToken?: string; wikiToken?: string; targets: LarkDestinations };

type LarkBindings = { LARK_APP_ID?: string; LARK_APP_SECRET?: string; LARK_BASE_APP_TOKEN?: string };
export type LarkField = { field_name: string; type: number; property?: { options?: { name?: string }[] } };
export type LarkRecord = { record_id: string; fields: Record<string, unknown> };
type Page<T> = { items?: T[]; has_more?: boolean; page_token?: string };
type Envelope<T> = { code?: number; msg?: string; data?: T; tenant_access_token?: string; expire?: number };
const fieldsToCheck = { "都道府県": 3, "種別管理": 3, "案件先機関名": 1, "案件先URL": 15, "提出期限": 5 } as const;
export function larkConfigured() { const e = env as LarkBindings; return !!e.LARK_APP_ID?.trim() && !!e.LARK_APP_SECRET?.trim(); }
export class LarkRequestError extends ApiError {
  constructor(message: string, public uncertain = false, status = 502) { super(status, message, uncertain ? "lark_uncertain" : "lark_error"); }
}
let cachedToken: { credentials: string; token: string; expires: number } | undefined;

export class LarkClient {
  constructor(private readonly connection?: LarkClientConnection) {}
  private token = "";
  private baseToken = "";
  private readonly deadline = Date.now() + 45000;
  private async request<T>(path: string, method = "GET", body?: unknown, write = false): Promise<Envelope<T>> {
    let response: Response, content: Envelope<T>;
    let transmitted = false;
    try {
      const remaining = this.deadline - Date.now();
      if (remaining <= 0) throw new Error("deadline");
      transmitted = true;
      response = await fetchWithoutRedirects(`https://open.larksuite.com/open-apis${path}`, {
        method, signal: AbortSignal.timeout(Math.min(15000, remaining)),
        headers: { "Content-Type": "application/json", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      if (text.length > 4000000) throw new Error("response size");
      content = JSON.parse(text) as Envelope<T>;
      if (!content || typeof content !== "object" || typeof content.code !== "number") throw new Error("response format");
    } catch {
      // No response body, URL, request headers, or credentials are logged or returned.
      throw new LarkRequestError(write && transmitted ? "Larkへの登録結果を確認できませんでした。「登録を確認」を押してください。" : "Larkから情報を取得できませんでした。時間をおいて再度お試しください。", write && transmitted);
    }
    if (!response.ok || content.code !== 0) {
      // A 5xx after a write may mean that a record was created before the failure.
      if (write && response.status >= 500) throw new LarkRequestError("Larkへの登録結果を確認できませんでした。「登録を確認」を押してください。", true);
      if (response.status === 401 || response.status === 403 || [99991663,99991664,99991668,99991672,99991679,91403,1254302].includes(content.code!)) {
        cachedToken = undefined;
        throw new LarkRequestError("Larkの接続権限を確認してください。管理者による設定が必要です。", false, 503);
      }
      if (response.status === 429 || content.code === 99991400) throw new LarkRequestError("Larkへの操作が集中しています。少し時間をおいて再度お試しください。", false, 429);
      throw new LarkRequestError(`Larkが処理を受け付けませんでした（コード：${content.code}）。管理者に確認してください。`);
    }
    return content;
  }
  async connect() {
    const e = env as LarkBindings;
    if (!this.connection && !larkConfigured()) throw new ApiError(503, "Larkの接続設定がまだ完了していません。", "lark_setup");
    const appId = this.connection?.appId ?? e.LARK_APP_ID!.trim(), appSecret = this.connection?.appSecret ?? e.LARK_APP_SECRET!.trim();
    const credentials = JSON.stringify([appId, appSecret]);
    if (!this.connection && cachedToken?.credentials === credentials && cachedToken.expires > Date.now()) this.token = cachedToken.token;
    else {
      const result = await this.request<never>("/auth/v3/tenant_access_token/internal", "POST", { app_id: appId, app_secret: appSecret });
      if (!result.tenant_access_token || !result.expire) throw new LarkRequestError("Larkの認証を確認できませんでした。管理者に確認してください。");
      this.token = result.tenant_access_token;
      if (!this.connection) cachedToken = { credentials, token: this.token, expires: Date.now() + Math.max(0, result.expire - 60) * 1000 };
    }
    const baseToken = this.connection ? this.connection.baseToken : e.LARK_BASE_APP_TOKEN?.trim();
    if (baseToken) this.baseToken = baseToken;
    else {
      const wikiToken = this.connection ? this.connection.wikiToken : larkWikiToken;
      if (!wikiToken || !/^[a-zA-Z0-9]+$/.test(wikiToken)) throw new LarkRequestError("Larkの接続先を確認してください。");
      const result = await this.request<{ node?: { obj_type: string; obj_token?: string } }>(`/wiki/v2/spaces/get_node?token=${wikiToken}`);
      if (result.data?.node?.obj_type !== "bitable" || !result.data.node.obj_token) throw new LarkRequestError("入札案件管理のBaseを確認できませんでした。");
      this.baseToken = result.data.node.obj_token;
    }
    if (!/^[a-zA-Z0-9]+$/.test(this.baseToken)) throw new LarkRequestError("Larkの接続先を確認してください。");
    return this;
  }
  get resolvedBaseToken() { return this.baseToken; }
  private path(mode: LarkMode) {
    const target = this.connection ? this.connection.targets[mode] : mode === "free" ? undefined : larkTargets[mode];
    if (!target) throw new ApiError(409, "フリーモードの登録先を接続設定に追加してください。", "lark_setup");
    return `/bitable/v1/apps/${this.baseToken}/tables/${target.tableId}`;
  }
  async fields(mode: LarkMode) {
    const result = await this.request<Page<LarkField>>(`${this.path(mode)}/fields?page_size=100`);
    const fields = result.data?.items;
    if (!Array.isArray(fields) || result.data?.has_more) throw new LarkRequestError("Larkのフィールド構成を確認できませんでした。");
    for (const [name, type] of Object.entries(fieldsToCheck)) {
      if (fields.find(field => field.field_name === name)?.type !== type) throw new ApiError(409, `Larkの「${name}」の形式が想定と異なります。フィールドを変更せず、管理者に確認してください。`);
    }
    return fields;
  }
  async duplicate(mode: LarkMode, item: LarkCandidate): Promise<LarkRecord | undefined> {
    let cursor = "";
    const seen = new Set<string>();
    for (let page = 0; page < 10; page++) {
      // Read only these two public procurement fields, never assignees or amounts.
      const params = new URLSearchParams({ page_size: "500" });
      if (cursor) params.set("page_token", cursor);
      const result = await this.request<Page<LarkRecord>>(`${this.path(mode)}/records/search?${params}`, "POST", {
        field_names: ["案件先機関名", "案件先URL"], automatic_fields: false,
      });
      if (!Array.isArray(result.data?.items)) throw new LarkRequestError("Larkの登録済み案件を確認できませんでした。");
      for (const row of result.data.items) {
        const link = row.fields?.["案件先URL"] as { link?: string; text?: string } | undefined;
        if (!link?.link) continue;
        let sameUrl = false;
        try { sameUrl = canonicalUrl(link.link) === canonicalUrl(item.officialUrl); } catch { continue; }
        if (!sameUrl) continue;
        const agencyValue = row.fields["案件先機関名"];
        const agency = typeof agencyValue === "string" ? agencyValue : Array.isArray(agencyValue) ? agencyValue.map(part => part?.text ?? "").join("") : "";
        if (normalizeLarkText(agency) !== normalizeLarkText(item.agency)) continue;
        if (normalizeLarkText(link.text ?? "") === normalizeLarkText(item.title)) return row;
        // An older manually entered URL may have no title. Do not silently add a
        // possible duplicate, or mistake a generic portal URL for an exact match.
        if (!link.text || link.text === link.link) throw new ApiError(409, "同じ公告URL・機関名の案件がLarkにあります。Larkで案件名を確認してください。", "lark_possible_duplicate");
      }
      if (!result.data.has_more) return undefined;
      if (!result.data.page_token || seen.has(result.data.page_token)) throw new LarkRequestError("Larkの登録済み案件を最後まで確認できませんでした。");
      cursor = result.data.page_token; seen.add(cursor);
    }
    throw new LarkRequestError("Larkの登録済み案件が多く、重複の確認を完了できませんでした。管理者に確認してください。");
  }
  async create(mode: LarkMode, fields: Record<string, unknown>, clientToken: string) {
    const result = await this.request<{ record?: LarkRecord }>(`${this.path(mode)}/records?client_token=${encodeURIComponent(clientToken)}`, "POST", { fields }, true);
    const record = result.data?.record;
    if (!record?.record_id || !/^rec[a-zA-Z0-9]+$/.test(record.record_id)) throw new LarkRequestError("Larkの登録結果を確認できませんでした。「登録を確認」を押してください。", true);
    return record;
  }
}

export function larkRecordFields(item: LarkCandidate, metadata: LarkField[]) {
  const warnings: string[] = [];
  const fields: Record<string, unknown> = {
    "案件先機関名": item.agency,
    "案件先URL": { text: item.title, link: item.officialUrl },
    "提出期限": Date.parse(`${item.deadline}T00:00:00+09:00`),
  };
  // The destination is a single-select field. Preserve the stricter requirement
  // if both classifications apply; never create or change select options.
  const type = item.classification?.unifiedRequiredEvidence ? "全省庁統一資格必須" : item.classification?.openCounterEvidence ? "オープンカウンター" : "";
  for (const [name, value] of [["都道府県", item.prefecture ?? ""], ["種別管理", type]]) {
    const options = metadata.find(field => field.field_name === name)?.property?.options ?? [];
    const option = value ? options.find(option => option.name && normalizeLarkText(option.name) === normalizeLarkText(value)) : undefined;
    if (option?.name) fields[name] = option.name;
    else warnings.push(`${name}は${value ? "既存の選択肢に一致しないため" : "確認できないため"}空欄で登録しました。`);
  }
  return { fields, warnings };
}
