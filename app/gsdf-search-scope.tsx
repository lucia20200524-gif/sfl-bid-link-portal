import { gsdfProcurementCatalog } from "@/lib/gsdf-procurement-catalog";

export default function GsdfSearchScope() {
  return <details className="discovery-coverage">
    <summary>陸上自衛隊の検索対象：16部隊・機関</summary>
    <p>各機関の公式ページから公告・オープンカウンター・添付PDFをたどります。東部方面隊の移動先や小平学校の別の公告一覧も対象です。取得した案件は検索語と参加資格の条件で絞り込みます。</p>
    <p>富士学校は一時的に対象外、幹部候補生学校・施設学校・衛生学校は検索対象外です。</p>
    <div className="discovery-table-scroll"><table className="discovery-table">
      <thead><tr><th>部隊・機関</th><th>公式の確認先</th></tr></thead>
      <tbody>{gsdfProcurementCatalog.map(entry=><tr key={entry.name}>
        <td>{entry.name}</td><td><a className="discovery-source-url" href={entry.entryUrl} target="_blank" rel="noopener noreferrer">{entry.entryUrl}</a>
          {entry.listingUrls.map(url=><a className="discovery-source-url" key={url} href={url} target="_blank" rel="noopener noreferrer">公告掲載先：{url}</a>)}</td>
      </tr>)}</tbody>
    </table></div>
    <p>画面を開いている間、順番に取得します。保存済みの候補は先に表示されます。アクセス制限・読取不可・取得上限は「取得状況」に表示し、案件なしとは区別します。全省庁統一資格または参加条件を確認できたオープンカウンターを対象にし、資格不明の案件は通常の検索結果から除きます。</p>
  </details>;
}
