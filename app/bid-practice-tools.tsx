"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import { ArrowUpRight, Calculator, ClipboardCheck, Copy, Download, FileSearch, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { calculateEstimate, checkItems, checkLabels, costItems, createPracticeDraft, documentItems, formatYen, officialUrl, practiceReport, reviewSummary, type CheckStatus, type CostKey, type PracticeDraft, type PracticeView, type ReviewEntry } from "@/lib/bid-practice";

type Props = { view: PracticeView; draft: PracticeDraft; setDraft: Dispatch<SetStateAction<PracticeDraft>> };
export default function BidPracticeTools({ view, draft, setDraft }: Props) {
  const [resetOpen, setResetOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [copyFallback, setCopyFallback] = useState("");
  const isCost = view === "cost-simulator";
  const isCheck = view === "participation-check";
  const entries = isCheck ? draft.checks : draft.documents;
  const items = isCheck ? checkItems : documentItems;
  const summary = reviewSummary(Object.values(entries));
  const estimate = calculateEstimate(draft.costs);
  const url = officialUrl(draft.url);
  const setEntry = (id: string, patch: Partial<ReviewEntry>) => setDraft(current => { const key = isCheck ? "checks" : "documents"; return { ...current, [key]: { ...current[key], [id]: { ...current[key][id], ...patch } } }; });
  const setCost = (key: CostKey, value: string) => setDraft(current => ({ ...current, costs: { ...current.costs, [key]: value } }));
  const copy = async () => { const text = practiceReport(view, draft); try { await navigator.clipboard.writeText(text); setCopyFallback(""); setMessage("コピーしました。Larkの案件メモなどに貼り付けられます。"); } catch { setCopyFallback(text); setMessage("下の文章を選択してコピーしてください。"); } };
  const download = () => { const blob = new Blob(["\uFEFF", practiceReport(view, draft)], { type: "text/plain;charset=utf-8" }); const href = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = href; link.download = `SFL_${view}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000); setMessage("テキストを書き出しました。"); };
  const numberField = (key: CostKey, label: string, unit = "円") => <label className="practice-field" key={key}><span>{label}</span><div className="practice-unit-input"><Input type="text" inputMode="decimal" maxLength={16} value={draft.costs[key]} onChange={e => setCost(key, e.target.value)} placeholder={key === "revenue" ? "提出予定の金額" : "0"} aria-invalid={!!estimate.errors[key]} aria-describedby={estimate.errors[key] ? `practice-error-${key}` : undefined}/><span>{unit}</span></div>{estimate.errors[key] && <small className="practice-error" id={`practice-error-${key}`}>{estimate.errors[key]}</small>}</label>;

  return <div className="practice-tools" key={view}>
    <section className="panel practice-context" aria-label="確認する案件">
      <div className="practice-context-fields"><label className="practice-field"><span>案件名 <small>3つのツールで共通</small></span><Input value={draft.title} maxLength={250} placeholder="例：研修の実施業務" onChange={e => setDraft(current => ({ ...current, title: e.target.value }))}/></label><label className="practice-field"><span>公式の公告URL</span><div className="practice-link-field"><Input type="url" value={draft.url} maxLength={2000} placeholder="https://…" aria-invalid={!!draft.url && !url} onChange={e => setDraft(current => ({ ...current, url: e.target.value }))}/>{url && <a className="button secondary" href={url} target="_blank" rel="noopener noreferrer">原文を開く<ArrowUpRight size={17}/></a>}</div>{draft.url && !url && <small className="practice-error">http:// または https:// から始まるURLを入力してください。</small>}</label></div>
      <p className="practice-note">入力はこの画面を開いている間だけ保持します。再読み込み・画面を閉じる前に、結果をコピーまたは書き出してください。</p>
    </section>

    <div className="practice-layout">
      <div className="practice-main">
        {isCost ? <section className="panel practice-form" aria-labelledby="practice-cost-title"><div className="practice-section-title"><Calculator size={23}/><h2 id="practice-cost-title">金額と作業時間を入力</h2><span className="practice-tag">すべて税抜</span></div><p className="practice-note">金額は税抜にそろえて入力してください。未入力の費用は0として計算します。</p><div className="practice-cost-grid">{numberField("revenue", "提出予定金額")}</div><h3>必要な費用</h3><div className="practice-cost-grid">{costItems.map(item => numberField(item.id, item.label))}</div><h3>自分・自社の作業</h3><p className="practice-note">準備、打合せ、修正、納品までの時間を含めます。外注費との二重計上に注意してください。</p><div className="practice-cost-grid">{numberField("hours", "作業時間", "時間")}{numberField("rate", "時間単価", "円／時間")}</div><div className="practice-subtotal"><span>作業時間分の費用</span><strong>{Object.keys(estimate.errors).length ? "入力を確認" : formatYen(estimate.labor)}</strong></div></section> : <section className="practice-review-list" aria-label={isCheck ? "参加条件の確認項目" : "資料の確認項目"}>
          <p className="practice-instruction">{isCheck ? "公式資料と自社の条件を照合し、結果と根拠を記録してください。" : "公告・仕様書を別タブで開き、下の項目に沿って内容を整理してください。資料の自動読取ではなく、原文を確認しながら記入するツールです。"}</p>
          {items.map((item, index) => { const entry = entries[item.id]; const incomplete = ["confirmed", "not-required"].includes(entry.status) && (!entry.content.trim() || !entry.source.trim()); return <article className="panel practice-review-card" data-status={entry.status} key={item.id}>
            <div className="practice-review-heading"><span className="practice-number">{String(index + 1).padStart(2, "0")}</span><h2>{item.title}</h2></div><p className="practice-note">{item.hint}</p>
            <label className="practice-field"><span>確認状況</span><NativeSelect value={entry.status} onChange={e => setEntry(item.id, { status: e.target.value as CheckStatus })} aria-label={`${item.title}の確認状況`}>{Object.entries(checkLabels).filter(([key]) => isCheck || key !== "mismatch").map(([key, label]) => <option value={key} key={key}>{label}</option>)}</NativeSelect></label>
            <label className="practice-field"><span>{isCheck ? "原文の条件・自社との照合メモ" : "原文から確認した内容"}</span><Textarea rows={3} maxLength={3000} value={entry.content} placeholder={isCheck ? "原文の条件と、自社が満たすかを記入" : "数量・日付・時刻などを具体的に記入"} onChange={e => setEntry(item.id, { content: e.target.value })}/></label>
            <label className="practice-field"><span>根拠の資料名・ページ</span><Input value={entry.source} maxLength={500} placeholder="例：入札公告 p.2「参加資格」／仕様書 p.3" onChange={e => setEntry(item.id, { source: e.target.value })}/></label>
            {incomplete && <p className="practice-error">確認内容と根拠を記入すると「確認済み」の件数に反映されます。</p>}
          </article>; })}
          {!isCheck && <section className="panel practice-form"><h2>質問・次に確認すること</h2><label className="practice-field"><span>発注者に確認したい点</span><Textarea rows={5} maxLength={5000} value={draft.questions} placeholder="該当する資料・ページ、分からない点、確認先や質問期限を記録" onChange={e => setDraft(current => ({ ...current, questions: e.target.value }))}/></label><p className="practice-note">質問は、公告に指定された期間・方法で発注者へ行ってください。</p></section>}
        </section>}
      </div>

      <aside className="practice-aside"><section className="panel practice-summary" aria-labelledby="practice-summary-title"><div className="practice-section-title">{isCost ? <Calculator size={22}/> : isCheck ? <ClipboardCheck size={22}/> : <FileSearch size={22}/>}<h2 id="practice-summary-title">{isCost ? "採算の試算" : "確認の進み具合"}</h2></div>
        {isCost ? <><div className={`practice-balance ${estimate.ready && estimate.balance < 0 ? "is-negative" : ""}`} aria-live="polite"><span>費用差引後の見込額</span><strong>{estimate.ready ? formatYen(estimate.balance) : "—"}</strong><small>{estimate.ready ? `提出予定金額に対する見込率 ${estimate.margin.toFixed(1)}%` : "提出予定金額と必要な費用を入力"}</small></div><dl className="practice-totals"><div><dt>提出予定金額</dt><dd>{estimate.ready ? formatYen(estimate.revenue) : "—"}</dd></div><div><dt>経費・予備費</dt><dd>{estimate.ready ? formatYen(estimate.cashCosts) : "—"}</dd></div><div><dt>作業時間分の費用</dt><dd>{estimate.ready ? formatYen(estimate.labor) : "—"}</dd></div><div><dt>総費用（収支が均衡する金額）</dt><dd>{estimate.ready ? formatYen(estimate.total) : "—"}</dd></div></dl>{estimate.ready && <p className={estimate.balance < 0 ? "practice-error" : "practice-note"}>{estimate.balance < 0 ? "計上した費用が提出予定金額を上回っています。金額・費用・作業時間を見直してください。" : estimate.balance === 0 ? "計上した費用と提出予定金額が同額です。追加費用があるとマイナスになります。" : "未計上の費用や追加作業がないか確認してください。"}</p>}<p className="practice-note">計算式：提出予定金額 − 経費・予備費 − 作業時間分の費用。入力した費用に基づく試算で、会計上の最終利益とは異なります。</p></> : <><div className="practice-progress-heading" aria-live="polite"><strong>{summary.confirmed}<small> / {summary.total} 項目</small></strong><span>内容・根拠を確認済み</span></div><Progress value={summary.confirmed / summary.total * 100} aria-label={`${summary.total}項目中${summary.confirmed}項目を確認済み`}/><dl className="practice-totals"><div><dt>未確認・要確認</dt><dd>{summary.remaining}項目</dd></div>{isCheck && <div><dt>条件不一致</dt><dd className={summary.mismatch ? "practice-error" : ""}>{summary.mismatch}項目</dd></div>}</dl><p className={summary.mismatch ? "practice-error" : "practice-note"}>{summary.mismatch ? "条件不一致の項目があります。参加を進める前に条件を再確認してください。" : summary.confirmed === summary.total ? "すべての項目に確認内容と根拠を記録しました。最新の訂正・回答も確認してください。" : "不明な項目は「要確認」のまま残し、原文や発注者への確認を進めましょう。"}</p><p className="practice-note">{isCheck ? "確認済みの件数は、参加資格の認定や参加可能の自動判定ではありません。" : "記入した内容を整理します。資料の取得や内容の正確性の自動判定は行いません。"}</p></>}
        <div className="practice-export"><button className="button primary" onClick={() => void copy()} disabled={isCost && !estimate.ready}><Copy size={18}/>結果をコピー</button><button className="button secondary" onClick={download} disabled={isCost && !estimate.ready}><Download size={18}/>テキストを書き出す</button></div><p className="practice-note">Larkの案件メモや、自分の資料に残せます。</p><p className="practice-message" role="status">{message}</p>{copyFallback && <label className="practice-field"><span>コピー用テキスト</span><Textarea readOnly rows={8} value={copyFallback} onFocus={e => e.target.select()}/></label>}
      </section><button className="text-button practice-reset" onClick={() => setResetOpen(true)}><RotateCcw size={17}/>別の案件を確認する</button></aside>
    </div>
    <AlertDialog open={resetOpen} onOpenChange={setResetOpen}><AlertDialogContent><AlertDialogTitle>3つのツールの入力をクリアしますか？</AlertDialogTitle><AlertDialogDescription>案件名・URL・参加条件・採算・資料確認の入力がすべて消えます。必要な結果は先にコピーまたは書き出してください。</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>戻る</AlertDialogCancel><AlertDialogAction onClick={() => { setDraft(createPracticeDraft()); setMessage(""); setCopyFallback(""); setResetOpen(false); }}>入力をクリアする</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
