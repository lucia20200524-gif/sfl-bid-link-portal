"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, LockKeyhole, LogIn, LogOut, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MemberLarkSettingsPanel } from "./member-lark-settings";
import { memberBaseUrlInput } from "@/lib/lark-destination";
import type { Session } from "@/lib/bid-domain";

async function request<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method, cache: "no-store", signal, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "処理できませんでした。もう一度お試しください。");
  return result;
}
function PasswordField({ value, onChange, label = "ログインPass（パスワード）", creating = false }: { value: string; onChange: (value: string) => void; label?: string; creating?: boolean }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return <div className="membership-password">
    <label htmlFor={id}>{label}</label>
    <Input id={id} name={creating ? "new-password" : "password"} type={visible ? "text" : "password"} autoComplete={creating ? "new-password" : "current-password"} required minLength={creating ? 12 : 1} maxLength={128} value={value} onChange={event => onChange(event.target.value)} aria-describedby={creating ? id + "-hint" : undefined}/>
    <label className="membership-show"><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)}/>パスワードを表示</label>
    {creating && <small id={id + "-hint"}>12〜128文字。推測されにくいものを設定してください。</small>}
  </div>;
}
export function MemberLogin({ signInUrl, onGuide }: { signInUrl: string; onGuide: () => void }) {
  const [loginId, setLoginId] = useState(""), [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      await request("/api/member-access", "POST", { action: "login", loginId, password });
      const session = await request<Session>("/api/workspace");
      if (!session.membership?.allowed) throw new Error("ログイン情報を保存できませんでした。サイトを別のタブで開き、Cookieを許可してからお試しください。");
      setPassword(""); window.location.reload();
    }
    catch (error) { setError(error instanceof Error ? error.message : "ログインできませんでした。"); setBusy(false); }
  };
  return <section className="panel membership-login" aria-labelledby="membership-login-title">
    <div className="membership-login-icon"><LockKeyhole size={26} aria-hidden="true"/></div>
    <p className="membership-label">案件検索・確認 ／ 会員専用</p>
    <h1 id="membership-login-title">会員ログイン</h1>
    <p>発行されたログインIDとパスワードを入力してください。</p>
    <form onSubmit={submit} className="membership-form" aria-busy={busy}>
      <label className="form-field"><span>ログインID</span><Input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={64} value={loginId} onChange={event => setLoginId(event.target.value)}/></label>
      <PasswordField value={password} onChange={setPassword}/>
      {error && <p className="app-error" role="alert">{error}</p>}
      <button className="button primary" type="submit" disabled={busy}><LogIn size={19}/>{busy ? "ログインしています…" : "ログイン"}</button>
    </form>
    <p className="membership-help">IDの発行・パスワードの再設定は、管理者にお問い合わせください。</p>
    <div className="membership-login-footer"><button className="text-button" onClick={onGuide}>使い方・ガイドを見る</button><a className="text-button" href={signInUrl} target="_top">管理者ログイン</a></div>
  </section>;
}
export function MemberLogout() {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const logout = async () => {
    setBusy(true); setError("");
    try { await request("/api/member-access", "POST", { action: "logout" }); window.location.reload(); }
    catch { setError("ログアウトできませんでした。再度お試しください。"); setBusy(false); }
  };
  return <div className="membership-logout"><button className="button secondary" onClick={logout} disabled={busy}><LogOut size={17}/>{busy ? "終了中…" : "ログアウト"}</button>{error && <p role="alert">{error}</p>}</div>;
}
function BaseUrlField({ value, onChange, configured = false, onConnect, busy = false }: { value: string; onChange: (value: string) => void; configured?: boolean; onConnect: () => void; busy?: boolean }) {
  const id = useId();
  const [urlError, setUrlError] = useState("");
  const connect = () => {
    const parsed = memberBaseUrlInput.safeParse(value);
    if (!parsed.success || !parsed.data) { setUrlError(parsed.success ? "Base URLを入力してください。" : parsed.error.issues[0].message); return; }
    setUrlError(""); onConnect();
  };
  return <div className="form-field membership-base-field">
    <label htmlFor={id}>接続先のLark Base URL{!configured && <span className="membership-optional">任意・後から設定できます</span>}</label>
    <div className="membership-base-input-row"><Input id={id} type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={2000} value={value} onChange={event => { setUrlError(""); onChange(event.target.value); }} readOnly={configured} placeholder="https://…larksuite.com/base/…" aria-describedby={id + "-hint"}/><button className="button primary" type="button" onClick={connect} disabled={busy || !value.trim()}><span className="lark-button-logo" aria-hidden="true"><img src="/lark-logo.png" alt="" width={28} height={28}/></span>{busy ? "処理中…" : configured ? "接続設定" : "接続"}</button></div>
    {urlError && <p className="app-error" role="alert">{urlError}</p>}
    <small id={id + "-hint"}>{configured ? "接続先を変更する場合は、下の「この会員のLark接続を設定」を開いてください。" : "会員ごとに複製したBaseを開き、ブラウザのURLを貼り付けてください。「接続」から接続設定へ進めます。"}</small>
  </div>;
}
type Account = { id: string; loginId: string; name: string; active: number; createdAt: number; larkBaseUrl: string; larkConfigured: boolean };
function AccountRow({ account, onUpdate, startConnection = false }: { account: Account; onUpdate: (accounts: Account[]) => void; startConnection?: boolean }) {
  const accountRef = useRef<HTMLDetailsElement>(null), connectionRef = useRef<HTMLDetailsElement>(null);
  const openConnection = () => { if (accountRef.current) accountRef.current.open = true; if (connectionRef.current) { connectionRef.current.open = true; connectionRef.current.querySelector("summary")?.focus(); connectionRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" }); } };
  useEffect(() => { if (startConnection) openConnection(); }, [startConnection]);
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [baseUrl, setBaseUrl] = useState(account.larkBaseUrl);
  const [credential, setCredential] = useState<{ password: string | null; message?: string } | null>(null), [revealing, setRevealing] = useState(false);
  const revealSequence = useRef(0);
  const hideCredential = () => { revealSequence.current++; setCredential(null); };
  useEffect(() => {
    if (!credential) return;
    const timer = setTimeout(hideCredential, 60000);
    const hideWhenInactive = () => { if (document.visibilityState !== "visible") hideCredential(); };
    document.addEventListener("visibilitychange", hideWhenInactive);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", hideWhenInactive); };
  }, [credential]);
  useEffect(() => () => { revealSequence.current++; }, []);
  const reveal = async () => {
    if (revealing) return;
    const sequence = ++revealSequence.current;
    setRevealing(true); setError("");
    try {
      const result = await request<{ password: string | null; message?: string }>("/api/member-accounts/credentials", "POST", { id: account.id }, AbortSignal.timeout(15000));
      if (sequence === revealSequence.current) setCredential(result);
    } catch { if (sequence === revealSequence.current) setError("ログイン情報を確認できませんでした。管理者としてログインしているか確認し、再度お試しください。"); }
    finally { setRevealing(false); }
  };
  useEffect(() => { setBaseUrl(account.larkBaseUrl); }, [account.larkBaseUrl]);
  const update = async (action: "status" | "password" | "lark-url", connectAfterSave = false) => {
    if (busy) return;
    setError(""); setMessage("");
    if (action === "password" && password !== confirm) { setError("確認用のパスワードが一致しません。"); return; }
    hideCredential();
    setBusy(true);
    try {
      const result = await request<{ accounts: Account[] }>("/api/member-accounts", "PATCH", { id: account.id, action, ...(action === "status" ? { active: !account.active } : action === "lark-url" ? { larkBaseUrl: baseUrl } : { password }) });
      onUpdate(result.accounts);
      if (connectAfterSave) openConnection();
      if (action === "lark-url") setBaseUrl(result.accounts.find(item => item.id === account.id)?.larkBaseUrl ?? "");
      else { setPassword(""); setConfirm(""); }
      setMessage(action === "lark-url" ? (baseUrl.trim() ? "Base URLを保存しました。次に「この会員のLark接続を設定」から接続を確認してください。" : "保存していたBase URLを削除しました。") : action === "password" ? "パスワードを再設定しました。新しいパスワードを本人にお伝えください。" : account.active ? "利用を停止しました。ログイン状態も解除しました。" : "利用を再開しました。");
    } catch (error) { setError(error instanceof Error ? error.message : "更新できませんでした。"); }
    finally { setBusy(false); }
  };
  return <details className="membership-account" ref={accountRef} onToggle={event => { if (!event.currentTarget.open) hideCredential(); }}>
    <summary><span><strong>{account.name}</strong><span className="membership-account-id">ID：{account.loginId}</span></span><span className={`pill ${account.active ? "member-active" : "member-stopped"}`}>{account.active ? "利用中" : "停止中"}</span></summary>
    <div className="membership-account-body">
      <section className="membership-form membership-base-form" aria-label="会員のログイン情報">
        <h3>ログイン情報（管理者のみ）</h3>
        <label className="form-field"><span>ログインID</span><Input readOnly value={account.loginId} autoComplete="off"/></label>
        {credential?.password ? <label className="form-field"><span>ログインPass</span><Input readOnly type="text" value={credential.password} autoComplete="off" spellCheck={false}/><small>60秒後、またはこの欄を閉じると非表示になります。</small></label> : credential?.message ? <p>{credential.message}</p> : <p>パスワードは通常、非表示です。</p>}
        <button type="button" className="button secondary" disabled={revealing} onClick={credential ? hideCredential : () => void reveal()}>{revealing ? "確認中…" : credential ? "ログインPassを隠す" : "ログインPassを表示"}</button>
      </section>
      <form className="membership-form membership-base-form" onSubmit={event => { event.preventDefault(); void update("lark-url"); }} aria-busy={busy}>
        <div className="membership-base-heading"><h3>Larkの保存先</h3><span className="membership-base-status">{account.larkConfigured ? "接続設定済み" : account.larkBaseUrl ? "URL保存済み・接続未設定" : "URL未登録"}</span></div>
        <BaseUrlField value={baseUrl} onChange={setBaseUrl} configured={account.larkConfigured} busy={busy || account.active !== 1} onConnect={() => account.larkConfigured ? openConnection() : void update("lark-url", true)}/>
        <div className="membership-base-actions">{!account.larkConfigured && <button className="button secondary" type="submit" disabled={busy}>{busy ? "保存中…" : "Base URLを保存"}</button>}{account.larkBaseUrl && <a className="text-button" href={account.larkBaseUrl} target="_blank" rel="noopener noreferrer">{account.larkConfigured ? "接続先のBaseを開く" : "保存したBaseを開く"}<ArrowUpRight size={18}/></a>}</div>
      </form>
      {account.active === 1 && <details className="tool-disclosure" ref={connectionRef}><summary>この会員のLark接続を設定</summary><MemberLarkSettingsPanel accountId={account.id} accountName={account.name} savedBaseUrl={account.larkBaseUrl}/></details>}
      <button className="button secondary" disabled={busy} onClick={() => void update("status")}>{account.active ? "この会員の利用を停止" : "この会員の利用を再開"}</button>
      <form className="membership-form" onSubmit={event => { event.preventDefault(); void update("password"); }}>
        <h3>パスワードを再設定</h3><PasswordField creating value={password} onChange={setPassword} label="新しいパスワード"/>
        <label className="form-field"><span>新しいパスワード（確認）</span><Input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={event => setConfirm(event.target.value)}/></label>
        <button className="button secondary" type="submit" disabled={busy}>パスワードを更新</button>
        <small>更新すると、この会員のログイン状態をすべて解除します。</small>
      </form>
      {error && <p className="app-error" role="alert">{error}</p>}{message && <p className="membership-message" role="status">{message}</p>}
    </div>
  </details>;
}
export function MembershipSettings({ session, signInUrl }: { session: Session; signInUrl: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [refresh, setRefresh] = useState(0);
  const [familyName, setFamilyName] = useState(""), [givenName, setGivenName] = useState("");
  const [loginId, setLoginId] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [connectAfterCreate, setConnectAfterCreate] = useState(false), [connectionAccountId, setConnectionAccountId] = useState("");
  useEffect(() => {
    if (session.role !== "owner") return;
    let active = true; setLoading(true); setLoadError("");
    request<{ accounts: Account[] }>("/api/member-accounts").then(result => { if (active) setAccounts(result.accounts); }).catch(error => { if (active) setLoadError(error.message); }).finally(() => { if (active) setLoading(false); });
    const connectionChanged = () => { request<{ accounts: Account[] }>("/api/member-accounts").then(result => { if (active) setAccounts(result.accounts); }).catch(error => { if (active) setLoadError(error.message); }); };
    window.addEventListener("lark-connection-changed", connectionChanged);
    return () => { active = false; window.removeEventListener("lark-connection-changed", connectionChanged); };
  }, [session.role, refresh]);
  const create = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setError(""); setMessage("");
    if (!familyName.trim() || !givenName.trim()) { setError("姓と名をそれぞれ入力してください。"); return; }
    const name = `${familyName.trim()} ${givenName.trim()}`;
    if (name.length > 100) { setError("姓と名は合わせて99文字以内で入力してください。"); return; }
    if (password !== confirm) { setError("確認用のパスワードが一致しません。"); return; }
    setBusy(true);
    try {
      const result = await request<{ accounts: Account[] }>("/api/member-accounts", "POST", { name, loginId, password, larkBaseUrl: baseUrl });
      if (connectAfterCreate) setConnectionAccountId(result.accounts.find(account => account.loginId === loginId.trim().toLowerCase())?.id ?? "");
      setConnectAfterCreate(false);
      setAccounts(result.accounts); setMessage(`${name}さんのログインID「${loginId.trim().toLowerCase()}」を作成しました。IDと設定したパスワードを本人にお伝えください。`);
      setFamilyName(""); setGivenName(""); setLoginId(""); setPassword(""); setConfirm(""); setBaseUrl("");
    } catch (error) { setError(error instanceof Error ? error.message : "作成できませんでした。"); }
    finally { setBusy(false); }
  };
  return <section className="panel membership-settings" aria-labelledby="membership-settings-title">
    <div className="panel-heading"><h2 id="membership-settings-title">会員ログインの管理</h2><LockKeyhole size={24}/></div>
    <p>「案件検索・確認」は会員専用です。使い方・ガイドはログインなしで閲覧できます。</p>
    {session.role !== "owner" ? <><p>{session.membership?.allowed ? `${session.user.name}さんは会員としてログイン中です。` : "会員IDの発行やパスワードの再設定は、管理者にお問い合わせください。"}</p><a className="text-button" href={signInUrl} target="_top">管理者ログイン</a></> : <>
      <p>ここで会員ごとのログインIDとパスワードを設定できます。管理者は現在の管理者ログインをそのまま利用できます。</p>
      {loading && <p role="status">会員を読み込んでいます…</p>}
      {loadError && <div className="app-error" role="alert">{loadError}<button className="text-button" onClick={() => setRefresh(value => value + 1)}>再読み込み</button></div>}
      {!loading && !loadError && <>
        <details className="membership-create" open={accounts.length === 0 ? true : undefined}>
          <summary><UserPlus size={20}/>会員IDを新しく発行</summary>
          <form onSubmit={create} className="membership-form" aria-busy={busy}>
            <div className="membership-name-fields">
              <label className="form-field"><span>姓</span><Input name="family-name" required autoComplete="off" maxLength={50} value={familyName} onChange={event => setFamilyName(event.target.value)} placeholder="例：山田"/></label>
              <label className="form-field"><span>名</span><Input name="given-name" required autoComplete="off" maxLength={50} value={givenName} onChange={event => setGivenName(event.target.value)} placeholder="例：太郎"/></label>
            </div>
            <label className="form-field"><span>ログインID</span><Input name="username" autoComplete="off" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={64} pattern="[A-Za-z0-9._\-]+" value={loginId} onChange={event => setLoginId(event.target.value)}/><small>3〜64文字の半角英数字・ . _ - が使えます。大文字・小文字は区別しません。</small></label>
            <PasswordField creating value={password} onChange={setPassword}/>
            <label className="form-field"><span>パスワード（確認）</span><Input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={event => setConfirm(event.target.value)}/></label>
            <BaseUrlField value={baseUrl} onChange={value => { setBaseUrl(value); setConnectAfterCreate(false); }} busy={busy} onConnect={() => setConnectAfterCreate(true)}/>
            {connectAfterCreate && <p className="membership-message" role="status">接続には会員IDが必要です。下の「会員IDを作成」を押すと、この会員専用の接続設定が開きます。Larkの接続情報を入力して設定を完了してください。</p>}
            {error && <p className="app-error" role="alert">{error}</p>}
            <button className="button primary" type="submit" disabled={busy}><UserPlus size={19}/>{busy ? "作成しています…" : "会員IDを作成"}</button>
            <small>発行したIDとパスワードは、登録済みの会員から管理者だけが確認できます。案内メールは自動送信されません。</small>
          </form>
        </details>
        {message && <p className="membership-message" role="status">{message}</p>}
        <h3>登録済みの会員 <span>({accounts.length}名)</span></h3>
        {accounts.length === 0 ? <p>まだ会員IDがありません。上のフォームから発行してください。</p> : <div className="membership-accounts">{accounts.map(account => <AccountRow key={account.id} account={account} onUpdate={setAccounts} startConnection={connectionAccountId === account.id}/>)}</div>}
      </>}
    </>}
  </section>;
}
