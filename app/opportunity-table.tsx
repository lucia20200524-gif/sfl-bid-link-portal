"use client";
import { ArrowLeftRight, ChevronRight, FileSearch } from "lucide-react";
import type { DiscoveryItem } from "@/lib/discovery-domain";
import { OpportunityType } from "./opportunity-cards";

export function OpportunityTable({ items, onDetails }: {
  items: DiscoveryItem[];
  onDetails: (item: DiscoveryItem) => void;
}) {
  return <><p className="opportunity-table-hint"><ArrowLeftRight size={18} aria-hidden="true"/>表は左右にスクロールできます。右端の「詳細」から条件を確認できます。</p><div className="discovery-table-scroll opportunity-table-scroll scrollbar-thin" role="region" aria-label="案件一覧表" tabIndex={0}>
    <table role="table" className="discovery-table opportunity-table-summary">
      <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">種別</th><th role="columnheader" scope="col">案件名</th><th role="columnheader" scope="col">募集機関名</th><th role="columnheader" scope="col">詳細</th></tr></thead>
      <tbody role="rowgroup">{items.map(item => <tr role="row" key={item.id} data-open-counter={!!item.classification?.openCounterEvidence}>
        <td role="cell" data-label="種別"><OpportunityType item={item}/></td>
        <td role="cell" data-label="案件名"><h3 className="opportunity-table-title">{item.title}</h3></td>
        <td role="cell" data-label="募集機関名" className="opportunity-table-agency">{item.agency || "未確認"}</td>
        <td role="cell"><button type="button" data-tour="candidate-details" className="button discovery-assess-button" aria-label={`${item.title}の詳細`} aria-haspopup="dialog" onClick={() => onDetails(item)}><FileSearch size={20} aria-hidden="true"/><span>詳細</span><ChevronRight size={18} aria-hidden="true"/></button></td>
      </tr>)}</tbody>
    </table>
  </div></>;
}
