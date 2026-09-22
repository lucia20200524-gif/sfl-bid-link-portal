import type { DiscoveryProgress } from "@/lib/discovery-domain";

const stateNames={pending:"確認待ち",checked:"取得済み",partial:"一部未確認",failed:"未取得"};
const time=(value?:number)=>value?new Date(value).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}):"記録なし";
export function DiscoveryCoverage({progress}:{progress?:DiscoveryProgress}){
  const sources=progress?.sources.filter(source=>source.targets?.length)??[];
  if(!sources.length)return null;
  const targets=sources.flatMap(source=>source.targets??[]);
  return <details className="discovery-coverage"><summary>取得先ごとの確認状況 <span>取得済み {targets.filter(t=>t.state==="checked").length} / 対象 {targets.length}</span></summary>
    <p>今回の巡回で確認した範囲です。「取得済み」は全案件の網羅を意味しません。最終成功はページ取得の記録時刻です（日本時間）。</p>
    {sources.map(source=><section key={source.name}><h3>{source.name}</h3><div className="discovery-table-scroll" role="region" aria-label={`${source.name}の確認先`} tabIndex={0}><table role="table" className="discovery-table"><caption className="sr-only">{source.name}の確認先</caption><thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">確認先</th><th role="columnheader" scope="col">状態</th><th role="columnheader" scope="col">ページ処理 / 待ち</th><th role="columnheader" scope="col">最終試行 / 最終成功</th></tr></thead><tbody role="rowgroup">{source.targets!.map(target=><tr role="row" key={target.name}><td role="cell" data-label="確認先">{target.url?<a href={target.url} target="_blank" rel="noopener noreferrer">{target.name}</a>:target.name}{target.listingUrls?.map(url=><a className="discovery-source-url" key={url} href={url} target="_blank" rel="noopener noreferrer">公告確認先：{url}</a>)}</td><td role="cell" data-label="状態"><span className={`coverage-state coverage-${target.state}`}>{stateNames[target.state]}</span>{target.missing&&<small>入口リンクを確認できませんでした</small>}{target.state==="partial"&&!target.noticesFound&&<small>公告の掲載内容は未確認です（案件なしとは限りません）</small>}{target.limited&&<small>今回の取得上限に達しました</small>}</td><td role="cell" data-label="ページ処理 / 待ち">{target.visited} / {target.pending}</td><td role="cell" data-label="最終試行 / 最終成功">{time(target.lastAttemptAt)}<br/>{time(target.lastSuccessAt)}</td></tr>)}</tbody></table></div></section>)}
  </details>;
}
