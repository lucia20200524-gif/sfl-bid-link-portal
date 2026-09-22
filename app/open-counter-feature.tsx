"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, ClipboardList, Clock3, Info, RefreshCw, Sparkles } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { collectionModes, type LarkMode } from "@/lib/collection-profiles";
import { candidateBucket, discoveryPageSize, type DiscoveryFeed, type DiscoveryItem } from "@/lib/discovery-domain";
import { larkCandidateIdentity } from "@/lib/lark-registration";
import { emptyCompanyProfile, type CompanyProfile } from "@/lib/procurement-workbench";
import { OpportunityActions, OpportunityCards } from "./opportunity-cards";
import { CandidateSheet, workbenchRequest } from "./procurement-tools";
import { useLarkRegistration, LarkRegistrationAction } from "./lark-registration";

const views = [
  { id: "all", label: "すべて", icon: ClipboardList },
  { id: "soon", label: "締切7日以内", icon: Clock3 },
  { id: "new", label: "新着7日・確認後の更新", icon: Sparkles },
  { id: "attention", label: "要確認", icon: Info },
] as const;
type Feed = Omit<DiscoveryFeed, "progress">;

export default function OpenCounterFeature({ mode, onMode, onSearch }: {
  mode: LarkMode; onMode: (mode: LarkMode) => void; onSearch: () => void;
}) {
  const [view, setView] = useState<string>("all"), [source, setSource] = useState("all"), [sort, setSort] = useState("deadline");
  const [offset, setOffset] = useState(0), [revision, setRevision] = useState(0);
  const [feed, setFeed] = useState<Feed | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [item, setItem] = useState<DiscoveryItem | null>(null), [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");
  const [profile, setProfile] = useState<CompanyProfile>(emptyCompanyProfile);
  const params = new URLSearchParams({ mode, view, source, sort, offset: String(offset) }).toString();
  useEffect(() => {
    const c = new AbortController();
    setLoading(true); setFeed(null); setError("");
    fetch(`/api/open-counter?${params}`, { signal: c.signal, cache: "no-store" }).then(async r => {
      const data = await r.json() as Feed & {error?:string;code?:string}; if (!r.ok) { if(data.code==="member_login_required")window.dispatchEvent(new CustomEvent("portal-access-denied",{detail:{status:r.status,code:data.code,message:data.error}})); throw new Error(data.error || "案件を読み込めませんでした。"); }
      if (!c.signal.aborted) setFeed(data);
    }).catch(e => { if (!c.signal.aborted) setError(e.message); }).finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [params, revision]);
  useEffect(() => {
    let active = true;
    workbenchRequest<{ profile: CompanyProfile }>("/api/procurement-workbench").then(v => { if (active) setProfile(v.profile); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const items = useMemo(() => feed?.items ?? [], [feed]);
  const lark = useLarkRegistration(mode, items);
  const review = async (candidate: DiscoveryItem) => {
    setBusyId(candidate.id); setActionError("");
    try {
      await workbenchRequest("/api/discovery", { action: "review", mode, id: candidate.id,
        state: candidate.review === "new" || candidate.updatedSinceReview ? "reviewed" : "new" });
      setRevision(v => v + 1);
    } catch (e) { setActionError(e instanceof Error ? e.message : "確認状況を保存できませんでした。"); }
    finally { setBusyId(""); }
  };
  const resetPage = () => { setOffset(0); setItem(null); setActionError(""); };
  const renderRegistration = (candidate: DiscoveryItem) => {
    const attention = candidateBucket(candidate, feed?.today) === "attention" || !candidate.deadline || !!candidate.withdrawalEvidence || !!candidate.retrievalIssue || !!candidate.updatedSinceReview || !!candidate.needsReview?.length || !!candidate.milestones?.some(m => m.date <= (feed?.today ?? ""));
    return <><LarkRegistrationAction destination={lark.destination} mode={mode} item={candidate} state={lark.rows[larkCandidateIdentity(candidate)]} disabled={!lark.configured || lark.checking || attention} onRegister={() => void lark.register(candidate).then(() => setRevision(v => v + 1))}/>{attention && <small>締切・条件を確認してから登録してください。</small>}</>;
  };
  return <div className="open-counter-feature">
    <section className="panel oc-feature-controls" aria-label="オープンカウンター案件を絞り込む">
      <div className="oc-feature-intro"><div><span className="oc-feature-mark"><ClipboardList size={20}/>見積合わせの案件をまとめて確認</span><p>保存済みの公告から、オープンカウンターの記載がある案件を集めました。</p></div><button className="button secondary" onClick={onSearch}>新しい公告を探す<ArrowUpRight size={18}/></button></div>
      <div className="oc-feature-views" aria-label="案件の表示条件">{views.map(v => <button type="button" key={v.id} aria-pressed={view === v.id} onClick={() => { setView(v.id); resetPage(); }}><v.icon size={21}/>{v.label}</button>)}</div>
      <div className="oc-feature-selects">
        <label>発注機関<NativeSelect value={source} onChange={e => { setSource(e.target.value); resetPage(); }}><option value="all">すべての取得先</option><option value="gsdf">陸上自衛隊</option><option value="msdf">海上自衛隊</option><option value="asdf">航空自衛隊</option><option value="mod">防衛省（陸・海・空を含む）</option><option value="kkj">官公需情報ポータルの取得分</option></NativeSelect></label>
        <label>並び順<NativeSelect value={sort} onChange={e => { setSort(e.target.value); resetPage(); }}><option value="deadline">締切が近い順</option><option value="newest">新しく取得した順</option></NativeSelect></label>
        <label>Larkへの登録先<NativeSelect value={mode} onChange={e => { resetPage(); onMode(e.target.value as LarkMode); }}>{collectionModes.map(m => <option value={m.id} key={m.id}>{m.label}</option>)}</NativeSelect></label>
      </div>
      <p className="oc-feature-note">参加資格：物品の販売 D・役務の提供等 D・物品の買受け C（固定）。別資格の必須案件・明確な等級不一致は除外しています。オープンカウンターでも、参加条件の原文確認が必要です。</p>
    </section>
    <section className="oc-feature-results" aria-label="オープンカウンターの案件一覧" aria-busy={loading}>
      <div className="oc-feature-result-heading"><div><h2>{views.find(v => v.id === view)?.label}<span>{feed ? `${feed.total.toLocaleString()}件` : "—"}</span></h2><p>締切が明日以降の案件と、締切などの確認が必要な案件。取得・保存できた範囲を表示しています。</p></div><button className="button secondary" disabled={loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={17} className={loading ? "spin" : ""}/>一覧を更新</button></div>
      {error && <p className="app-error" role="alert">{error} 件数が0件という意味ではありません。</p>}
      {feed?.truncated && <p className="app-error">保存案件のうち20,000件までを確認しています。発注機関や締切で絞り込んでください。</p>}
      {loading ? <p className="oc-feature-empty" role="status">オープンカウンター案件を読み込んでいます…</p> : !feed ? null : !items.length ? <div className="oc-feature-empty"><ClipboardList size={32}/><h3>この条件に合う保存案件はありません</h3><p>表示条件を変えるか、「新しい公告を探す」から取得を進めてください。</p><button className="button primary" onClick={onSearch}>新しい公告を探す<ArrowUpRight size={18}/></button></div> : <>
        <OpportunityCards summaryOnly items={items} today={feed.today} busyId={busyId} onDetails={candidate => { setItem(candidate); setActionError(""); }} onReview={review} renderRegistration={renderRegistration}/>
        <nav className="oc-feature-pagination" aria-label="案件一覧のページ"><button className="button secondary" disabled={offset === 0} onClick={() => { setOffset(v => Math.max(0, v - discoveryPageSize)); setItem(null); }}><ChevronLeft size={18}/>前へ</button><span>{offset + 1}–{offset + items.length} / {feed.total}件</span><button className="button secondary" disabled={offset + items.length >= feed.total} onClick={() => { setOffset(v => v + discoveryPageSize); setItem(null); }}>次の{discoveryPageSize}件<ChevronRight size={18}/></button></nav>
      </>}
      {!lark.checking && !lark.configured && lark.message && <p className="oc-feature-note">Lark登録：{lark.message}</p>}
    </section>
    <CandidateSheet item={items.find(candidate => candidate.id === item?.id) ?? item} profile={profile} today={feed?.today} actionError={actionError} onClose={() => setItem(null)} renderActions={candidate => <OpportunityActions item={candidate} busyId={busyId} onReview={review} renderRegistration={renderRegistration}/>}/>
  </div>;
}
