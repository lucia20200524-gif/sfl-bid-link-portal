"use client";
import type { ReactNode } from "react";
import { ArrowUpRight, Check, ChevronRight, ClipboardList, FileSearch } from "lucide-react";
import type { DiscoveryItem } from "@/lib/discovery-domain";
import { isMunicipalProcurement } from "@/lib/procurement-classification";
import { procurementBrief } from "@/lib/procurement-brief";
import { DiscoveryProvenance } from "./discovery-provenance";

export function OpportunityBrief({ item, labels }: { item: DiscoveryItem; labels?: string[] }) {
  return <dl className="opportunity-brief">{procurementBrief(item).filter(field => !labels || labels.includes(field.label)).map(field => <div key={field.label} data-unknown={!!field.unknown}>
    <dt>{field.label}</dt><dd>{field.value}</dd>
    {field.label === "入札・見積締切" && item.deadline && <small>時刻は原文の記載を確認</small>}
    {field.evidence && <details className="brief-evidence"><summary>根拠を見る</summary><blockquote>{field.evidence}</blockquote><a href={item.officialUrl} target="_blank" rel="noopener noreferrer">公告原文を開く<ArrowUpRight size={14}/></a></details>}
  </div>)}</dl>;
}
export function SynonymReasons({ item }: { item: DiscoveryItem }) {
  if (!item.expandedMatches?.length) return null;
  return <div className="synonym-reasons"><strong>言い換え一致</strong>{item.expandedMatches.slice(0,3).map(hit => <p key={hit.input + hit.term}>「{hit.input}」→「{hit.term}」<small>（{hit.location === "title" ? "件名" : "本文"}）</small></p>)}{item.expandedMatches.length > 3 && <details><summary>ほか{item.expandedMatches.length - 3}語の一致</summary>{item.expandedMatches.slice(3).map(hit => <p key={hit.input + hit.term}>「{hit.input}」→「{hit.term}」（{hit.location === "title" ? "件名" : "本文"}）</p>)}</details>}</div>;
}
export function OpportunityType({ item }: { item: DiscoveryItem }) {
  const labels:{category:string;label:string}[]=[];
  if(item.classification?.openCounterEvidence)labels.push({category:"open-counter",label:"オープンカウンター"});
  if(item.classification?.unifiedRequiredEvidence||item.classification?.unifiedEligibleEvidence)labels.push({category:"unified-required",label:item.classification.unifiedRequiredEvidence?"全省庁統一資格必須":"全省庁統一資格対象"});
  if(item.classification?.municipal||isMunicipalProcurement(item))labels.push({category:"municipal",label:"自治体・参加条件要確認"});
  if(!labels.length)labels.push({category:"other",label:item.contractMethod||"未確認"});
  return <div className="opportunity-type">{labels.map(({category,label}) => <span key={category} data-category={category}>{label}</span>)}</div>;
}
export function OpportunityActions({ item, busyId, onReview, renderRegistration }: {
  item: DiscoveryItem; busyId: string; onReview: (item: DiscoveryItem) => void; renderRegistration: (item: DiscoveryItem) => ReactNode;
}) {
  return <div className="opportunity-actions"><button type="button" className="button secondary discovery-review" disabled={busyId === item.id} onClick={() => onReview(item)}><Check size={16}/>{item.review === "new" || item.updatedSinceReview ? "確認済みにする" : "未確認に戻す"}</button><div data-tour="lark-action">{renderRegistration(item)}</div></div>;
}
export function OpportunityCards({ items, today, busyId, onDetails, onReview, renderRegistration, summaryOnly = false }: {
  items: DiscoveryItem[]; today: string; busyId: string; summaryOnly?: boolean;
  onDetails: (item: DiscoveryItem) => void; onReview: (item: DiscoveryItem) => void;
  renderRegistration: (item: DiscoveryItem) => ReactNode;
}) {
  if (summaryOnly) return <div className="opportunity-cards opportunity-cards-summary">{items.map(item => <article className="opportunity-card opportunity-card-summary" key={item.id} data-open-counter={!!item.classification?.openCounterEvidence}>
    <dl className="opportunity-summary"><div><dt>種別</dt><dd><OpportunityType item={item}/></dd></div><div><dt>案件名</dt><dd><h3>{item.title}</h3></dd></div><div><dt>募集機関名</dt><dd>{item.agency || "未確認"}</dd></div></dl>
    <footer><button type="button" data-tour="candidate-details" className="button discovery-assess-button" aria-label={`${item.title}の詳細`} aria-haspopup="dialog" onClick={() => onDetails(item)}><FileSearch size={20} aria-hidden="true"/><span>詳細</span><ChevronRight size={18} aria-hidden="true"/></button></footer>
  </article>)}</div>;
  return <div className="opportunity-cards">{items.map(item => <article className="opportunity-card" key={item.id} data-open-counter={!!item.classification?.openCounterEvidence}>
    <header><div className="discovery-badges">
      {item.classification?.openCounterEvidence && <strong className="discovery-open-counter-badge"><ClipboardList size={21} aria-hidden="true"/>オープンカウンター</strong>}
      {Date.now() - (item.firstSeen || 0) < 7 * 86400000 && <span>新着</span>}
      {item.updatedSinceReview && <span className="attention">更新あり</span>}
      {item.review === "reviewed" && <span>確認済み</span>}
      {item.review === "dismissed" && <span>対象外</span>}
      {item.registered && <span>登録済み</span>}
    </div><h3><a data-tour="official-link" href={item.officialUrl} target="_blank" rel="noopener noreferrer">{item.title}<ArrowUpRight size={18}/></a></h3><p className="discovery-agency">{item.agency || "機関名は原文で確認"}</p>
    <DiscoveryProvenance item={item}/></header>
    {item.retrievalIssue && <p className="app-error">再取得できなかったため、前回の情報です。原文で最新内容を確認してください。</p>}
    {item.withdrawalEvidence && <p className="app-error">中止・取消の記載あり：{item.withdrawalEvidence}</p>}
    {item.deadline && item.deadline <= today && <p className="app-error">入札・見積締切が本日以前の案件です。</p>}
    {item.milestones?.some(m => m.date <= today) && <p className="app-error">先行手続きの期限が到来しています。手続きの状況を確認してください。</p>}
    <div className="opportunity-match"><p>{item.reasons?.find(reason => !reason.startsWith("言い換え："))}</p><SynonymReasons item={item}/></div>
    <OpportunityBrief item={item}/>
    <footer><button type="button" className="button discovery-assess-button" aria-haspopup="dialog" onClick={() => onDetails(item)}><FileSearch size={21} aria-hidden="true"/><span>条件・期限を<wbr/>詳しく見る</span><ChevronRight size={19} aria-hidden="true"/></button>
    <OpportunityActions item={item} busyId={busyId} onReview={onReview} renderRegistration={renderRegistration}/>
    {item.reviewReason && <small>対象外：{item.reviewReason}</small>}</footer>
  </article>)}</div>;
}
