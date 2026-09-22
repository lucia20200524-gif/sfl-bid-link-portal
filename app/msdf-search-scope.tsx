import { msdfProcurementCatalog } from "@/lib/msdf-procurement-catalog";

export default function MsdfSearchScope() {
  return <details className="discovery-coverage">
    <summary>海上自衛隊の検索対象：33基地・契約機関</summary>
    <p>公式の「公告」から各基地の一般入札・オープンカウンター・添付PDFを順に確認します。第１術科学校の統合先は呉地方総監部です。下総・航空補給処の移動先、佐世保掲載の対馬・奄美の資料も検索対象です。</p>
    <p>以下は2026年9月16日に確認した掲載先です。今回の取得成否は「取得状況」に表示します。</p>
    <div className="discovery-table-scroll"><table className="discovery-table">
      <thead><tr><th>基地・契約機関</th><th>公式の確認先・調査結果</th></tr></thead>
      <tbody>{msdfProcurementCatalog.map(entry=><tr key={entry.name}>
        <td>{entry.name}</td><td><a className="discovery-source-url" href={entry.entryUrl} target="_blank" rel="noopener noreferrer">入口：{entry.entryUrl}</a>
          {entry.listings.map(listing=><a className="discovery-source-url" key={listing.url} href={listing.url} target="_blank" rel="noopener noreferrer">{listing.title}：{listing.url}</a>)}
          {entry.note&&<p>{entry.note}</p>}</td>
      </tr>)}</tbody>
    </table></div>
    <p>全省庁統一資格の利用条件が確認できた案件とオープンカウンターに絞ります。等級・地域・実績等は原文をご確認ください。動的表示・読取不可・アクセス制限・取得上限は未確認として表示します。一覧PDFの期限を案件ごとに判別できない場合は、締切を推測せず「要確認」に保存します。</p>
  </details>;
}
