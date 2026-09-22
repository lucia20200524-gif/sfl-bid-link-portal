export type PracticeView = "participation-check" | "cost-simulator" | "document-review";
export const practiceViews: PracticeView[] = ["participation-check", "cost-simulator", "document-review"];
export const checkItems = [
  { id: "qualification", title: "資格・参加名義", hint: "求められる資格の種類、有効期間、申請する事業者名を照合します。" },
  { id: "grade", title: "等級・営業品目", hint: "対象等級と営業品目を確認。資格不要の記載がある場合も、原文を確認します。" },
  { id: "region", title: "競争参加地域・実施場所", hint: "資格の参加地域と、納品・作業場所の条件を確認します。" },
  { id: "experience", title: "実績・許認可・その他の条件", hint: "類似実績、必要な許認可、証明資料などの追加条件を確認します。" },
  { id: "delivery", title: "仕事内容・納期・対応体制", hint: "数量、成果物、作業日程を確認し、契約どおりに対応できるか判断します。" },
  { id: "advance", title: "事前手続き・質問期限", hint: "説明会、参加申請、事前審査、同等品の承認などの要否と期限を確認します。" },
  { id: "submission", title: "必要書類・提出期限・提出方法", hint: "書類、提出先、日付・時刻、郵送の必着条件などを確認します。" },
  { id: "contract", title: "契約・支払・資金の条件", hint: "再委託、保証、検査、支払条件と、入金までの費用負担を確認します。" },
] as const;
export type CheckStatus = "unreviewed" | "review" | "confirmed" | "mismatch" | "not-required";
export const checkLabels: Record<CheckStatus, string> = { unreviewed: "未確認", review: "要確認", confirmed: "確認済み", mismatch: "条件不一致", "not-required": "対象外（原文確認済み）" };
export const documentItems = [
  { id: "scope", title: "仕事内容・作業範囲", hint: "何を、どこまで行う仕事ですか？打合せ・修正・保守も確認します。" },
  { id: "deliverables", title: "数量・成果物・納品場所", hint: "品名、数量、成果物の形式、納品先、検査の条件を記録します。" },
  { id: "eligibility", title: "参加資格・必要書類", hint: "資格・等級・実績の条件と、提出を求められている書類を記録します。" },
  { id: "deadlines", title: "各手続きの期限", hint: "質問・参加申請・見積／入札・納品を分け、日付と時刻を記録します。" },
  { id: "method", title: "提出方法・窓口", hint: "提出先、郵送・持参・電子提出等の指定、連絡先を記録します。" },
  { id: "payment", title: "契約・支払条件", hint: "支払時期、検査、保証、再委託の条件などを記録します。" },
  { id: "changes", title: "訂正公告・質問への回答", hint: "追加資料や変更の有無、確認日を記録します。見つからない場合は未確認にします。" },
] as const;
export type ReviewEntry = { status: CheckStatus; content: string; source: string };
export const costItems = [
  { id: "purchase", label: "仕入れ・材料費" }, { id: "outsource", label: "外注費" },
  { id: "shipping", label: "送料・梱包費" }, { id: "travel", label: "交通・宿泊費" },
  { id: "other", label: "その他の経費・配賦する共通経費" }, { id: "reserve", label: "予備費" },
] as const;
export type CostKey = typeof costItems[number]["id"] | "revenue" | "hours" | "rate";
export type CostInput = Record<CostKey, string>;
export type PracticeDraft = { title: string; url: string; checks: Record<string, ReviewEntry>; costs: CostInput; documents: Record<string, ReviewEntry>; questions: string };
const emptyEntry = (): ReviewEntry => ({ status: "unreviewed", content: "", source: "" });
export function createPracticeDraft(): PracticeDraft {
  return { title: "", url: "", checks: Object.fromEntries(checkItems.map(x => [x.id, emptyEntry()])), costs: { revenue: "", purchase: "", outsource: "", shipping: "", travel: "", other: "", reserve: "", hours: "", rate: "" }, documents: Object.fromEntries(documentItems.map(x => [x.id, emptyEntry()])), questions: "" };
}
export function reviewSummary(entries: ReviewEntry[]) {
  const confirmed = entries.filter(x => ["confirmed", "not-required"].includes(x.status) && x.source.trim() && x.content.trim()).length;
  const mismatch = entries.filter(x => x.status === "mismatch").length;
  return { total: entries.length, confirmed, mismatch, remaining: entries.length - confirmed - mismatch };
}
export function calculateEstimate(input: CostInput) {
  const values = {} as Record<CostKey, number>;
  const errors: Partial<Record<CostKey, string>> = {};
  for (const key of Object.keys(input) as CostKey[]) {
    const raw = input[key].trim();
    const number = Number(raw);
    const maximum = key === "hours" ? 100_000 : 1_000_000_000;
    if (raw && (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isFinite(number) || number < 0 || number > maximum)) errors[key] = `0以上${maximum.toLocaleString("ja-JP")}以下の半角数値（小数2桁まで・カンマなし）を入力してください。`;
    values[key] = raw && !errors[key] ? number : 0;
  }
  if (input.revenue.trim() && values.revenue <= 0 && !errors.revenue) errors.revenue = "提出予定金額は0より大きい数値にしてください。";
  if (input.hours.trim() && !input.rate.trim()) errors.rate = "作業時間を計上する場合は時間単価も入力してください。";
  if (input.rate.trim() && !input.hours.trim()) errors.hours = "時間単価を計上する場合は作業時間も入力してください。";
  const ready = !!input.revenue.trim() && !Object.keys(errors).length;
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const labor = round(values.hours * values.rate);
  const cashCosts = round(costItems.reduce((sum, item) => sum + values[item.id], 0));
  const total = round(cashCosts + labor);
  const balance = round(values.revenue - total);
  return { ready, errors, revenue: values.revenue, labor, cashCosts, total, balance, margin: ready ? balance / values.revenue * 100 : 0 };
}
export function officialUrl(value: string): string | null {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export const formatYen = (value: number) => `${value.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}円`;
export function practiceReport(view: PracticeView, draft: PracticeDraft): string {
  const titles = { "participation-check": "参加条件チェック", "cost-simulator": "見積・採算シミュレーター", "document-review": "公告・仕様書の確認サポート" };
  const lines = [`【${titles[view]}】`, `案件名：${draft.title || "未入力"}`, `公告URL：${draft.url || "未入力"}`, ""];
  if (view === "cost-simulator") {
    const result = calculateEstimate(draft.costs);
    lines.push("金額はすべて税抜。未入力の費用は0として試算。", `提出予定金額：${draft.costs.revenue || "未入力"}円`, ...costItems.map(x => `${x.label}：${draft.costs[x.id] || "0（未入力）"}円`), `自分・自社の作業：${draft.costs.hours || "0（未入力）"}時間 × ${draft.costs.rate || "0（未入力）"}円／時間`);
    if (result.ready) lines.push(`総費用：${formatYen(result.total)}`, `費用差引後の見込額：${formatYen(result.balance)}`, `見込率：${result.margin.toFixed(1)}%`, "この試算は入力した費用のみを反映し、会計上の最終利益や受注を保証するものではありません。");
    else lines.push("計算未完了：提出予定金額と入力内容を確認してください。", ...Object.values(result.errors));
  } else {
    const items = view === "participation-check" ? checkItems : documentItems;
    const entries = view === "participation-check" ? draft.checks : draft.documents;
    const summary = reviewSummary(Object.values(entries));
    lines.push(`確認済み：${summary.confirmed}/${summary.total}項目、未確認・要確認：${summary.remaining}項目、条件不一致：${summary.mismatch}項目`, "");
    items.forEach(item => { const entry = entries[item.id]; const missing = ["confirmed", "not-required"].includes(entry.status) && (!entry.source.trim() || !entry.content.trim()); lines.push(`${item.title}：${checkLabels[entry.status]}${missing ? "（内容・根拠の記入が必要）" : ""}`, `確認内容：${entry.content || "未記入"}`, `根拠の資料・ページ：${entry.source || "未記入"}`, ""); });
    if (view === "document-review") lines.push(`質問・次に確認すること：\n${draft.questions || "未記入"}`);
    lines.push("最終判断は最新の公式資料・発注者への確認に基づいて行ってください。");
  }
  return lines.join("\n");
}
