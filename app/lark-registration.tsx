"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { LarkMode, PresetMode } from "@/lib/collection-profiles";
import type { ProcurementCandidate } from "@/lib/procurement-search";
import { larkCandidateIdentity, larkRegistrationKey, larkTableUrl, larkTargets, larkTargetNames, type LarkRegistrationState, type LarkRegistrationStatus, type LarkRegistrationResult } from "@/lib/lark-registration";
import type { LarkDestination } from "@/lib/lark-destination";

class RegistrationError extends Error { constructor(message: string, public code = "") { super(message); } }
async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store", signal, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json() as T & {error?:string;code?:string};
  if (!response.ok) { if(data.code==="member_login_required")window.dispatchEvent(new CustomEvent("portal-access-denied",{detail:{status:response.status,code:data.code,message:data.error}})); throw new RegistrationError(data.error ?? "Larkへの接続を確認してください。", data.code); }
  return data;
}
type RowState = LarkRegistrationState & { busy?: boolean; error?: string };
export function useLarkRegistration(mode: LarkMode, items: ProcurementCandidate[]) {
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [configured, setConfigured] = useState(false), [checking, setChecking] = useState(true), [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [destination, setDestination] = useState<LarkDestination | undefined>(), [destinationRevision, setDestinationRevision] = useState("");
  useEffect(() => { const refresh = () => { setRows({}); setConfigured(false); setDestination(undefined); setRevision(value => value + 1); }; window.addEventListener("lark-connection-changed", refresh); return () => window.removeEventListener("lark-connection-changed", refresh); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setChecking(true); setRows({}); setConfigured(false); setDestination(undefined); setDestinationRevision("");
    const run = async () => {
      try {
        const identities = await Promise.all(items.slice(0, 100).map(async item => ({ identity: larkCandidateIdentity(item), key: await larkRegistrationKey(mode, item) })));
        const status = await request<LarkRegistrationStatus>("/api/lark/registrations/status", { mode, keys: identities.map(item => item.key) }, controller.signal);
        if (controller.signal.aborted) return;
        setRows(Object.fromEntries(identities.filter(item => status.registrations[item.key]).map(item => [item.identity, status.registrations[item.key]])));
        setConfigured(status.configured); setMessage(status.message ?? "");
        setDestination(status.destination); setDestinationRevision(status.destinationRevision ?? "");
      } catch (error) {
        if (!controller.signal.aborted) { setRows({}); setDestination(undefined); setConfigured(false); setMessage(error instanceof Error ? error.message : "登録状況を確認できませんでした。"); }
      } finally { if (!controller.signal.aborted) setChecking(false); }
    };
    void run();
    return () => controller.abort();
  }, [mode, items, revision]);
  const register = async (item: ProcurementCandidate) => {
    const identity = larkCandidateIdentity(item);
    if (!configured || checking || !destinationRevision || rows[identity]?.busy || rows[identity]?.state === "registered") return;
    setRows(previous => ({ ...previous, [identity]: { ...previous[identity], state: "checking", busy: true, error: "" } }));
    try {
      const result = await request<LarkRegistrationResult>("/api/lark/registrations", { mode, destinationRevision, item: { title: item.title, agency: item.agency, officialUrl: item.officialUrl, deadline: item.deadline, prefecture: item.prefecture, classification: item.classification } });
      if (result.registered !== true) throw new RegistrationError("登録結果を確認できませんでした。", "lark_uncertain");
      setRows(previous => ({ ...previous, [identity]: { state: "registered", recordUrl: result.recordUrl, warnings: result.warnings } }));
      toast(result.alreadyRegistered ? `${result.targetName}に登録済みです。` : `${result.targetName}に登録しました。`);
    } catch (error) {
      setRows(previous => ({ ...previous, [identity]: { state: "checking", busy: false, error: error instanceof Error ? error.message : "登録結果を確認できませんでした。" } }));
    }
  };
  return { rows, configured, checking, message, destination, register, refresh: () => setRevision(value => value + 1) };
}

export function LarkRegistrationAction({ mode, item, state, disabled, onRegister, destination }: {
  mode: LarkMode; item: ProcurementCandidate; state?: RowState; disabled: boolean; onRegister: () => void; destination?: LarkDestination;
}) {
  const done = state?.state === "registered";
  return <div className="lark-registration-action">
    <button type="button" className={`button lark-register-button${done ? " registered" : ""}`} disabled={done || state?.busy || disabled || !destination} onClick={onRegister} aria-busy={state?.busy || undefined} aria-label={`${item.title}を${destination?.name ?? larkTargetNames[mode]}のLarkへ登録`}>
      <span className="lark-button-logo" aria-hidden="true"><img src="/lark-logo.png" alt="" width={28} height={28}/></span>
      <span>{state?.busy ? "登録を確認中…" : done ? "登録済み" : state?.state === "checking" ? "登録を確認" : "Larkへ登録"}</span>
      {state?.busy ? <LoaderCircle size={18} className="spin" aria-hidden="true"/> : done ? <Check size={18} aria-hidden="true"/> : state?.state === "checking" ? <RefreshCw size={18} aria-hidden="true"/> : null}
    </button>
    {destination ? <span className="lark-save-destination">保存先：<a href={destination.url} target="_blank" rel="noopener noreferrer">{destination.name}</a></span> : <a className="text-button" href="#settings">Larkの接続設定を確認</a>}
    {done && state.recordUrl && <a className="text-button lark-record-link" href={state.recordUrl} target="_blank" rel="noopener noreferrer">Larkで見る<ArrowUpRight size={16}/></a>}
    {state?.error && <p className="lark-row-error" role="alert">{state.error}{destination && <a href={destination.url} target="_blank" rel="noopener noreferrer">登録先を開く</a>}</p>}
    {!!state?.warnings?.length && <details className="lark-row-warnings"><summary>登録内容の確認</summary>{state.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>}
  </div>;
}

export function LarkConnectionPanel() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [ok, setOk] = useState(false);
  const check = async () => {
    setBusy(true); setMessage("");
    try { const result = await request<{ connected: boolean; message: string }>("/api/lark/connection"); setOk(result.connected); setMessage(result.message); }
    catch (error) { setOk(false); setMessage(error instanceof Error ? error.message : "接続を確認できませんでした。"); }
    finally { setBusy(false); }
  };
  return <section className="panel lark-connection-panel"><div className="panel-heading"><div><h2>Larkへの案件登録</h2><p>調査結果一覧の「Larkへ登録」から、選んだ案件を登録できます。</p></div><button className="button secondary" type="button" disabled={busy} onClick={check}>{busy ? <LoaderCircle className="spin" size={18}/> : <RefreshCw size={18}/>}接続を確認</button></div>
    <ul>{(Object.keys(larkTargets) as PresetMode[]).map(mode => <li key={mode}><a href={larkTableUrl(mode)} target="_blank" rel="noopener noreferrer">{larkTargets[mode].name}<ArrowUpRight size={16}/></a></li>)}</ul>
    {message && <p className={ok ? "lark-connected" : "app-error"} role="status">{message}</p>}
  </section>;
}
