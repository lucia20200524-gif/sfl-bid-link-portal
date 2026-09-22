"use client";
import { useEffect, useId, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Link, LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { larkModes, type MemberLarkSettings } from "@/lib/lark-destination";
import { larkTargetNames } from "@/lib/lark-registration";
import type { LarkMode } from "@/lib/collection-profiles";

async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "接続設定を確認できませんでした。もう一度お試しください。");
  return result;
}
function TemplateSettings({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(""); setMessage("");
    try { await request("/api/lark/template", "POST", { url, emptyTemplateConfirmed: confirmed }); setMessage("会員に案内するテンプレートを保存しました。"); }
    catch (error) { setError(error instanceof Error ? error.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }
  return <details className="tool-disclosure"><summary>配布用テンプレートの設定（管理者）</summary><form className="member-lark-form" onSubmit={save}>
    <p>SFLの案件管理Baseから、実案件を含まない配布用の複製を用意してください。フリーモードを含む4つのテーブルと項目を残し、会員が複製できる共有URLを設定します。</p>
    <label className="form-field"><span>配布用テンプレートの共有URL</span><Input type="url" value={url} maxLength={2000} onChange={event => setUrl(event.target.value)} placeholder="https://…larksuite.com/…"/><small>空欄で保存すると、会員へのテンプレートリンクを非表示にします。</small></label>
    <label className="member-lark-check"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>実案件や個人情報がなく、複製を許可したテンプレートであることを確認しました。</label>
    <button className="button primary" disabled={busy} type="submit">{busy ? "保存中…" : "テンプレートを保存"}</button>
    {error && <p className="app-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </form></details>;
}
export function MemberLarkSettingsPanel({ accountId, accountName, savedBaseUrl }: { accountId?: string; accountName?: string; savedBaseUrl?: string }) {
  const [settings, setSettings] = useState<MemberLarkSettings | null>(null), [loadError, setLoadError] = useState(""), [refresh, setRefresh] = useState(0);
  const [appId, setAppId] = useState(""), [secret, setSecret] = useState("");
  const [urls, setUrls] = useState<Record<LarkMode, string>>({ sfl: "", engineer: "", academy: "", free: "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [disconnect, setDisconnect] = useState(false);
  const id = useId(), endpoint = "/api/lark/member-connection" + (accountId ? `?accountId=${encodeURIComponent(accountId)}` : "");
  const apply = (data: MemberLarkSettings) => { setSettings(data); setAppId(data.appId ?? ""); setSecret(""); setUrls(Object.fromEntries(larkModes.map(mode => [mode, data.targets?.[mode]?.url ?? ""])) as Record<LarkMode, string>); };
  useEffect(() => {
    let active = true; setLoadError(""); setSettings(null);
    request<MemberLarkSettings>(endpoint).then(data => { if (active) apply(data); }).catch(error => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [endpoint, refresh]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !settings) return; setBusy(true); setError(""); setMessage("");
    try {
      const result = await request<MemberLarkSettings>(endpoint, "POST", { revision: settings.revision, appId, ...(secret ? { appSecret: secret } : {}), urls });
      apply(result); setMessage("指定されたテーブルと項目を確認し、接続設定を保存しました。次の案件からこのBaseへ登録します。");
      window.dispatchEvent(new Event("lark-connection-changed"));
    } catch (error) { setError(error instanceof Error ? error.message : "保存できませんでした。"); }
    finally { setBusy(false); setSecret(""); }
  }
  async function remove() {
    if (busy || !settings) return; setBusy(true); setError(""); setMessage("");
    try { apply(await request<MemberLarkSettings>(endpoint, "DELETE", { revision: settings.revision })); setDisconnect(false); setMessage("接続を解除しました。Larkに保存済みの案件はそのまま残ります。"); window.dispatchEvent(new Event("lark-connection-changed")); }
    catch (error) { setError(error instanceof Error ? error.message : "解除できませんでした。"); }
    finally { setBusy(false); }
  }
  return <section className={`member-lark-settings${accountId ? "" : " panel"}`} aria-labelledby={id}>
    <div className="panel-heading"><h2 id={id}>{accountName ? `${accountName}さんのLark接続` : "自分のLarkへ案件を保存"}</h2><Link size={23}/></div>
    {loadError ? <p className="app-error" role="alert">{loadError}<button className="text-button" onClick={() => setRefresh(value => value + 1)}>再読み込み</button></p> : !settings ? <p role="status">接続設定を読み込んでいます…</p> : settings.owner ? <><p>管理者の案件は、SFLの案件管理Baseへ登録します。</p><TemplateSettings initialUrl={settings.templateUrl}/><p>会員の初回設定は、下の「登録済みの会員」から代行できます。</p></> : <>
      <div className="member-lark-state"><strong>{settings.configured ? <><Check size={19}/>登録先を設定済み</> : "初回の接続設定"}</strong><span>{settings.configured ? "案件の詳細から、この会員のBaseへ登録できます。" : "SFLの案件管理テンプレートを、ご自身のLarkへ複製して使います。"}</span></div>
      {!settings.configured && (savedBaseUrl ?? settings.savedBaseUrl) && <div className="membership-base-form"><strong>Base URL保存済み・接続未設定</strong><p>保存したBaseを開いて、下の接続設定を進めてください。</p><a className="button secondary" href={savedBaseUrl ?? settings.savedBaseUrl} target="_blank" rel="noopener noreferrer">保存したBaseを開く<ArrowUpRight size={18}/></a></div>}
      {settings.configured && settings.targets && <ul className="member-lark-targets">{larkModes.filter(mode => settings.targets?.[mode]).map(mode => <li key={mode}><a href={settings.targets![mode]!.url} target="_blank" rel="noopener noreferrer">{settings.targets![mode]!.name}<ArrowUpRight size={17}/></a></li>)}</ul>}
      <details className="tool-disclosure" open={settings.configured ? undefined : true}><summary>{settings.configured ? "接続先を確認・変更する" : "テンプレートを複製して接続する"}</summary>
        <div className="member-lark-form">
          <h3>1. テンプレートを自分のLarkへ複製</h3>
          {settings.templateUrl ? <a className="button secondary" href={settings.templateUrl} target="_blank" rel="noopener noreferrer">SFLの案件管理テンプレートを開く<ArrowUpRight size={18}/></a> : <p>配布用テンプレートのリンクは準備中です。SFLから受け取ったテンプレートがある場合は、ご自身のLarkに複製して次へ進めます。</p>}
          <p>Lark側で複製し、4つのテーブルと項目名・項目の形式はそのまま残してください。</p>
          <h3>2. 初回の接続を設定</h3>
          <p>初回はSFLと一緒に設定できます。ご自身の組織のLark連携アプリを用意し、複製先Baseへの接続を許可してください。</p>
          <details className="member-lark-help"><summary>連携アプリを設定する担当者向け</summary><p>Lark Developerで社内アプリを作成・公開し、複製したBaseにアプリを追加します。Baseの読み取り・フィールド確認・レコードの取得と作成を許可し、Base側でも編集権限を付与してください。Wiki内のBaseではノードの読み取り権限も必要です。</p><p>App IDとApp SecretはLarkアプリの接続情報です。ポータルのログインID・パスワードとは異なります。接続確認は既存の項目を読み取り、テスト案件は追加しません。案件を登録するときに書き込み権限も確認されます。</p></details>
          <form onSubmit={save} className="member-lark-form" aria-busy={busy}>
            <div className="member-lark-credentials"><label className="form-field"><span>App ID</span><Input autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={100} value={appId} onChange={event => setAppId(event.target.value)} placeholder="cli_…"/></label>
            <label className="form-field"><span>App Secret</span><Input type="password" autoComplete="new-password" spellCheck={false} required={!settings.configured || appId !== settings.appId} minLength={8} maxLength={300} value={secret} onChange={event => setSecret(event.target.value)} placeholder={settings.configured ? "変更するときだけ入力" : "連携アプリの接続キー"}/></label></div>
            <h3>3. 複製先のテーブルを指定</h3><p>複製したBaseで各テーブルを開き、ブラウザのURLをコピーしてください。以前の3テーブルで接続済みの場合も、フリーモードのURLを追加して保存できます。</p>
            {larkModes.map(mode => <label className="form-field" key={mode}><span>{larkTargetNames[mode]}のURL{mode === "free" && "（フリーモード用）"}</span><Input type="url" required={mode !== "free"} maxLength={2000} value={urls[mode]} onChange={event => setUrls(previous => ({ ...previous, [mode]: event.target.value }))} placeholder="https://…larksuite.com/base/…?table=tbl…"/></label>)}
            <button className="button primary" type="submit" disabled={busy}>{busy && <LoaderCircle size={18} className="spin"/>}{busy ? "接続を確認しています…" : "接続を確認して保存"}</button>
          </form>
        </div>
      </details>
      {settings.configured && <details className="member-lark-disconnect"><summary>このポータルとの接続を解除</summary><p>保存済みのLark案件は削除されません。再設定するまで新しい登録は停止します。</p><label className="member-lark-check"><input type="checkbox" checked={disconnect} onChange={event => setDisconnect(event.target.checked)}/>この接続を解除する</label><button className="button secondary" type="button" disabled={busy || !disconnect} onClick={remove}>接続を解除</button></details>}
      {error && <p className="app-error" role="alert">{error}</p>}{message && <p className="membership-message" role="status">{message}</p>}
    </>}
  </section>;
}
