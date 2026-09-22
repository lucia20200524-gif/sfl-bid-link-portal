"use client";

import { ArrowRight, ChevronRight, Clock3, Inbox, Search, Target } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { deadlineText, statusLabels, todayJst, type Bid, type Dashboard } from "@/lib/bid-domain";

export default function WorkOverview({ data, openBid, openList, findBids, memberName }: {
  data: Dashboard | null;
  openBid: (bid: Bid) => void;
  openList: (status?: string, deadline?: string) => void;
  findBids: () => void;
  memberName: (email: string) => string;
}) {
  const count = (statuses: string[]) => data ? data.statusCounts.filter(item => statuses.includes(item.status)).reduce((sum, item) => sum + item.count, 0) : "—";
  return <>
    <section className="work-launch" aria-label="新しい案件を探す">
      <div className="work-launch-copy"><span className="launch-label">SFL 入札リンクポータル</span><h2>得意な仕事を、<span>次の挑戦に。</span></h2><p>条件の合う一件を探して、参加の準備を始めましょう。</p></div>
      <div className="work-launch-action"><button className="button challenge-button" onClick={findBids}><Search size={21}/>案件を探す<ArrowRight size={20}/></button><span>検索 → 公式公告の確認 → Larkへ登録</span></div>
    </section>
    <div className="work-metrics">
      <button className="work-metric urgent" onClick={() => openList("active", "soon")}><span><Clock3 size={19}/>7日以内に締切</span><strong>{data?.dueSoon ?? "—"}<small>件</small></strong><span className="metric-action">優先して確認<ChevronRight size={16}/></span></button>
      <button className="work-metric" onClick={() => openList("active")}><span><Inbox size={19}/>対応中の案件</span><strong>{data?.active ?? "—"}<small>件</small></strong><span className="metric-action">案件一覧へ<ChevronRight size={16}/></span></button>
      <article className="work-metric"><span><Target size={19}/>今週の提出</span><strong>{data?.weekly ?? "—"}<small>/ 3件</small></strong><Progress value={Math.min(100, (data?.weekly ?? 0) / 3 * 100)} aria-label="今週の提出目標"/></article>
      <article className="work-metric"><span><Target size={19}/>今月の提出</span><strong>{data?.monthly ?? "—"}<small>/ 12件</small></strong><Progress value={Math.min(100, (data?.monthly ?? 0) / 12 * 100)} aria-label="今月の提出目標"/></article>
    </div>
    <div className="work-priorities">
      <section className="panel deadline-panel">
        <div className="panel-heading"><div><h2>先に確認する案件</h2><p className="section-description">対応中の案件を、締切が近い順に表示</p></div><button className="text-button" onClick={() => openList("active")}>すべて見る<ChevronRight size={17}/></button></div>
        {data?.deadlines.length ? <div className="deadline-list">{data.deadlines.map(bid => <button key={bid.id} onClick={() => openBid(bid)}>
          <div className={`deadline-date${bid.deadline && bid.deadline <= todayJst() ? " urgent" : ""}`}><strong>{bid.deadline ? bid.deadline.slice(5).replace("-", "/") : "要確認"}</strong><small>{deadlineText(bid.deadline)}</small></div>
          <div className="deadline-item-copy"><strong>{bid.title}</strong><span>{bid.agency} · {memberName(bid.assignee)}</span></div>
          <span className={`status status-${bid.status}`}>{statusLabels[bid.status]}</span><ChevronRight size={18}/>
        </button>)}</div> : <div className="work-empty"><Inbox size={28}/><strong>{data ? "対応中の案件はありません" : "案件を読み込んでいます…"}</strong>{data && <><p>候補を探し、参加を検討する案件を登録してください。</p><button className="button primary" onClick={findBids}>案件を探す<ChevronRight size={17}/></button></>}</div>}
      </section>
      <section className="panel next-actions"><h2>次にすること</h2><p className="section-description">状況を選ぶと、対象の案件を開けます。</p>
        {[{label:"参加するか判断",hint:"公告・参加資格・予算を確認",status:"new",statuses:["new"],step:"01"},{label:"検討中の条件を確認",hint:"実施体制・懸念点を整理",status:"reviewing",statuses:["reviewing"],step:"02"},{label:"提案・見積を提出",hint:"締切・担当者・提出日を確認",status:"preparing",statuses:["preparing"],step:"03"}].map(item => <button className="next-action" key={item.status} onClick={() => openList(item.status)}><span className="action-step">{item.step}</span><span className="action-copy"><strong>{item.label}</strong><small>{item.hint}</small></span><span className="action-count">{count(item.statuses)}<small>件</small></span><ChevronRight size={16}/></button>)}
        <button className="text-button" onClick={() => openList("active", "unknown")}>締切が未入力の案件を確認<ChevronRight size={17}/></button>
      </section>
    </div>
  </>;
}
