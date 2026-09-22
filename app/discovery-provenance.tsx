import type { DiscoveryItem } from "@/lib/discovery-domain";

function safeUrl(value?:string) {
  try { const url=new URL(value??"");return /^https?:$/.test(url.protocol)?url.href:undefined; } catch { return undefined; }
}
function channel(url:string) {
  const host=new URL(url).hostname;
  return host==="kkj.go.jp"||host==="www.kkj.go.jp"?"官公需情報ポータル API":host==="mod.go.jp"||host.endsWith(".mod.go.jp")?"防衛省・自衛隊の公式掲載ページ":"掲載元";
}
export function DiscoveryProvenance({item}:{item:DiscoveryItem}) {
  const origins=[...new Set([...(item.origins??[]),item.sourceUrl].map(safeUrl).filter((url):url is string=>!!url))];
  const original=safeUrl(item.officialUrl);
  return <div className="discovery-provenance">
    <strong>案件情報の取得元</strong>
    <span>出典名：{item.source||"記録なし"}</span>
    {origins.length?origins.map(url=><div key={url}><span>取得経路：{channel(url)}</span><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></div>):<span>掲載元URL：記録なし</span>}
    {original&&<div><span>公告・原文URL：</span><a href={original} target="_blank" rel="noopener noreferrer">{original}</a></div>}
    <span>最終取得確認：{item.lastSeen?new Date(item.lastSeen).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})+"（日本時間）":"記録なし"}</span>
  </div>;
}
