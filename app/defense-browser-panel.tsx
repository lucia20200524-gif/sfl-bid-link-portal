import { ArrowUpRight, Monitor } from "lucide-react";
import { defenseBrowserRules, type DefenseSourceId } from "@/lib/defense-browser-rules";

export default function DefenseBrowserPanel({ sourceId,configured=null }: { sourceId: DefenseSourceId;configured?:boolean|null }) {
  const rule = defenseBrowserRules[sourceId];
  return <div className="defense-browser-panel" data-search-method="official-browser">
    <div className="defense-browser-heading"><Monitor size={22}/><div><strong>公式ページをブラウザーで確認</strong><span className="defense-browser-status">{configured===null?"接続設定を確認中":configured?"検索設定済み · 実行時に接続確認":"検索処理の準備済み · 接続設定待ち"}</span></div></div>
    <p>{rule.navigation}</p>
    <details className="defense-browser-targets"><summary>確認対象：{rule.targets.length}{rule.targetUnit}を確認する</summary><p>{rule.title}</p><ul>{rule.targets.map(target=><li key={target}>{target}</li>)}</ul></details>
    <p className="defense-browser-connection" role="status">{configured?"公式ページと公告資料を確認し、条件に一致した案件を一覧に反映します。取得できない確認先は、取得状況に表示します。":"Cloudflareの接続設定が完了すると、この画面から調査を開始できます。未接続の状態は案件が0件という意味ではありません。"}</p>
    <a className="button secondary" href={rule.entryUrl} target="_blank" rel="noopener noreferrer">公式の確認先を開く<ArrowUpRight size={18}/></a>
  </div>;
}
