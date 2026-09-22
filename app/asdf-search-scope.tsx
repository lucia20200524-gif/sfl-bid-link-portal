import { asdfProcurementCatalog } from "@/lib/asdf-procurement-catalog";

export default function AsdfSearchScope() {
  return <details className="discovery-coverage">
    <summary>航空自衛隊の検索対象：28基地・契約機関</summary>
    <p>航空自衛隊の公式一覧から、画像にある28機関の入札公告・公示・オープンカウンター・添付PDFを順に確認します。</p>
    <p>以下は2026年9月16日に調査した掲載先です。入口の確認と公告本文の取得は別です。今回の検索で取得できた範囲・エラーは「取得状況」で確認できます。</p>
    <div className="discovery-table-scroll"><table className="discovery-table">
      <thead><tr><th>基地・契約機関</th><th>公式の確認先・調査結果</th></tr></thead>
      <tbody>{asdfProcurementCatalog.map(entry=><tr key={entry.name}>
        <td>{entry.name}</td><td><a className="discovery-source-url" href={entry.entryUrl} target="_blank" rel="noopener noreferrer">入口：{entry.entryUrl}</a>
          {entry.listings.map(listing=><a className="discovery-source-url" key={listing.url} href={listing.url} target="_blank" rel="noopener noreferrer">{listing.title}：{listing.url}</a>)}
          {entry.note&&<p>{entry.note}</p>}</td>
      </tr>)}</tbody>
    </table></div>
    <p>全省庁統一資格の利用条件が確認できた案件とオープンカウンターに絞ります。等級・地域・実績等は原文をご確認ください。納期・入札日時を提出期限に置き換えず、期限不明の案件は「要確認」に保存します。読取不可・アクセス制限・取得上限は、案件なしと区別して表示します。</p>
  </details>;
}
