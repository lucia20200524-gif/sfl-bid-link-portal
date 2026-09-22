"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import type { DiscoveryProgress } from "@/lib/discovery-domain";
import { DiscoveryCoverage } from "./discovery-coverage";

const dateTime = (value?: number) => value ? new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "未取得";

export default function DiscoveryStatus({ onSearch }: { onSearch: () => void }) {
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      let delay = 30000;
      try {
        const response = await fetch("/api/discovery/progress", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as {progress:DiscoveryProgress;error?:string;code?:string};
        if (!response.ok) {
          if (response.status === 401 || data.code === "membership") window.dispatchEvent(new CustomEvent("portal-access-denied", { detail: { status: response.status, code: data.code, message: data.error } }));
          throw new Error(data.error || "取得状況を読み込めませんでした。");
        }
        if (controller.signal.aborted) return;
        setProgress(data.progress);
        setError("");
        if (data.progress.status === "running") delay = 5000;
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "取得状況を読み込めませんでした。");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(refresh, delay);
        }
      }
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision]);

  const message = progress?.message?.replace(/一部の取得先・検索条件は未確認です。?/g, "").trim();
  const stateLabel: Record<string, string> = { idle: "未実施", running: "収集の続きあり", completed: "取得処理終了", paused: "一時停止", partial: "一部未確認", failed: "取得エラーあり" };
  return <div className="discovery-status-page">
    <div className="discovery-status-toolbar">
      <p>最終処理 <strong>{dateTime(progress?.updatedAt)}</strong>（日本時間）</p>
      <div className="actions">
        <button type="button" className="button secondary" disabled={loading} onClick={() => { setLoading(true); setRevision(value => value + 1); }}><RefreshCw size={18} className={loading ? "spin" : undefined}/>更新</button>
        <button type="button" className="button primary" onClick={onSearch}><Search size={18}/>案件を探す</button>
      </div>
    </div>
    {error && <p className="app-error" role="alert">{error}「更新」から再度お試しください。{progress && "下には直前に読み込めた状況を表示しています。"}</p>}
    {!progress && loading && <p className="panel" role="status">取得状況を読み込んでいます…</p>}
    {progress && <section className="panel discovery-progress" aria-label="公告の取得状況">
      <p><strong>{stateLabel[progress.status] ?? "取得状況を確認してください"}</strong></p>
      <dl className="discovery-status-counts">
        <div><dt>処理済み</dt><dd>{progress.processed.toLocaleString()}<span>回</span></dd></div>
        <div><dt>処理待ち</dt><dd>{progress.pending.toLocaleString()}<span>件</span></dd></div>
        <div><dt>保存した案件</dt><dd>{progress.saved.toLocaleString()}<span>件</span></dd></div>
      </dl>
      {message && <p>{message}</p>}
      <details className="discovery-status-sources" open>
        <summary>取得先ごとの進捗</summary>
        {progress.sources.length ? <ul>{progress.sources.map(source => <li key={source.name}>
          <div className="discovery-status-source-heading"><h2>{source.name}</h2><p>{source.processed.toLocaleString()}回処理・{source.pending.toLocaleString()}件待ち</p></div>
          {source.officialUrl && <a className="discovery-source-url" href={source.officialUrl} target="_blank" rel="noopener noreferrer">確認先URL：{source.officialUrl}</a>}
          {source.issues.length > 0 && <details>
            <summary>未確認・一部取得 {source.issues.length}項目</summary>
            {source.issues.map((issue, index) => <p key={index}>{issue}</p>)}
            {source.pageIssues?.map((issue, index) => <div className="discovery-page-issue" key={issue.url + index}>
              <strong>{issue.title}</strong>
              <p>{issue.resolvedUrl ? "掲載元から移動先を確認し、取得できました。" : issue.message}</p>
              <div><a href={issue.resolvedUrl || issue.parentUrl || issue.url} target="_blank" rel="noopener noreferrer">{issue.resolvedUrl ? "更新された公式ページを開く" : issue.parentUrl && issue.parentUrl !== issue.url ? "掲載元の公式ページで確認" : "公式ページで確認"}<ArrowUpRight size={14}/></a>{!issue.resolvedUrl && issue.parentUrl && issue.parentUrl !== issue.url && <a href={issue.url} target="_blank" rel="noopener noreferrer">元のリンク</a>}</div>
            </div>)}
            {source.officialUrl && <a className="text-button" href={source.officialUrl} target="_blank" rel="noopener noreferrer">公式の調達案内を開く<ArrowUpRight size={15}/></a>}
          </details>}
        </li>)}</ul> : <p>まだ取得の記録がありません。「案件を探す」から検索を開始できます。</p>}
      </details>
      <DiscoveryCoverage progress={progress}/>
      <details className="discovery-status-operation">
        <summary>定期処理・保存について</summary>
        <p>{progress.schedulerLastRun ? `定期処理の最終実行：${dateTime(progress.schedulerLastRun)}（日本時間）` : "定期実行は接続待ちです。収集を開始・再開するときは「案件を探す」の「最新情報を取得」を押してください。"}</p>
        <p>公式サイトへの負荷を抑え、順番に取得します。件数は取得範囲内の件数です。画面を閉じても結果と続きは保存されます。</p>
      </details>
    </section>}
  </div>;
}
