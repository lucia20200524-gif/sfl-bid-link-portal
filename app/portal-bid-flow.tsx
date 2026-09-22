"use client";

import { defaultQualificationGrades, qualificationSummary } from "@/lib/company-qualification";
import { useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, BookOpen, Calculator, Check, ChevronRight, ClipboardCheck, ExternalLink, FileCheck2, FileSearch, FileText, Handshake, Info, PackageCheck, Receipt, Search, Send, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";

const officialSources = {
  overview: { label: "デジタル庁｜政府調達の流れ", href: "https://www.digital.go.jp/procurement/introduction" },
  qualification: { label: "調達ポータル｜全省庁統一資格", href: "https://www.p-portal.go.jp/pps-web-biz/geps-chotatujoho/resources/app/html/shikaku.html" },
  openCounter: { label: "防衛省｜オープンカウンター方式", href: "https://www.mod.go.jp/j/budget/chotatsu/naikyoku/mitsumori/index.html" },
  documents: { label: "防衛装備庁｜入札・契約、納品・請求の様式例", href: "https://www.mod.go.jp/atla/data/info/kokoroe/kokoroe.html" },
};

const phases = [
  { label: "参加の準備", range: "01", first: 0, last: 0, icon: ShieldCheck },
  { label: "探す・参加を決める", range: "02–04", first: 1, last: 3, icon: Search },
  { label: "提出・結果を確認", range: "05–07", first: 4, last: 6, icon: Send },
  { label: "契約から入金まで", range: "08–10", first: 7, last: 9, icon: Handshake },
];

const steps = [
  {
    short: "参加準備", title: "参加する名義と資格を確認する", icon: ShieldCheck,
    lead: "最初に「誰の名義で、どの仕事に参加するか」を決めましょう。",
    actions: ["資格通知書の名義・有効期間・営業品目・等級・競争参加地域を確認する。", "狙う案件の条件と照合し、必要な資格や許認可がそろっているか確認する。", "資格の申請や電子入札の利用登録が必要なら、提出に間に合うよう準備する。"],
    records: ["資格通知書", "必要な許認可", "事業者の正式名称・連絡先"],
    ready: "参加名義が決まり、自社の資格と、追加で必要な準備が分かっている。",
    exampleTitle: "ポータルの資格条件（固定）", example: `全省庁統一資格：${qualificationSummary(defaultQualificationGrades)}。公告の対象等級・参加地域・営業品目・有効期間を案件ごとに照合します。物品の販売と買受けは別の資格区分です。`,
    tip: "全省庁統一資格があるだけで、すべての案件に参加できるわけではありません。",
    source: officialSources.qualification,
  },
  {
    short: "案件探し", title: "できそうな仕事を1件見つける", icon: Search,
    lead: "最初は得意な仕事の言葉で検索し、候補を1件選びましょう。",
    actions: ["「研修」「動画制作」「印刷」など、対応できる仕事のキーワードで検索する。", "仕事内容・実施場所・納期を見て、対応できそうな候補を絞る。", "検索結果から公式の公告や見積依頼書を開き、URLと資料を保存する。"],
    records: ["案件名・発注機関", "公式URL", "公告・見積依頼書"],
    ready: "候補の公式資料を開けて、何を求められている仕事か説明できる。",
    exampleTitle: "検索から管理までの例", example: "「研修」で検索 → 気になる案件の公式資料を開く → 条件を確認 → Larkへ登録して担当・期限を整理します。",
    tip: "ポータルやLarkへの登録は候補の管理です。発注者への参加申請・提出は、別途必要です。",
    source: officialSources.overview, link: { href: "#collected", label: "ポータルで案件を探す" },
  },
  {
    short: "資料確認", title: "仕事内容・参加条件・締切を読む", icon: FileSearch,
    lead: "公告だけでなく、仕様書・説明書・訂正情報までひとまとまりで確認します。",
    actions: ["公告の参加条件と、仕様書の作業範囲・成果物・数量・納期を読む。", "質問、参加申請、入札書・見積書の期限と提出方法を、それぞれ記録する。", "分からない点をまとめ、指定の期間・方法で発注者に確認する。回答や訂正も確認する。"],
    records: ["公告・説明書", "仕様書・契約書案", "質問への回答・訂正", "各手続きの期限"],
    ready: "参加条件と仕事の範囲が分かり、締切と未確認事項が整理できている。",
    exampleTitle: "先に抜き出す項目", example: "何を／どこで／いつまでに／どの状態で納めるか。そのうえで、参加に必要な条件と、提出する書類・方法を確認します。",
    tip: "入札の締切が先でも、参加申請や質問の期限が終了していることがあります。",
    source: officialSources.overview,
  },
  {
    short: "参加判断", title: "費用と時間を見積もり、参加を決める", icon: Calculator,
    lead: "受注できた場合に、無理なく納品できるかを確認しましょう。",
    actions: ["仕入れ・外注・送料・移動などの費用に、自分の作業時間も加えて考える。", "準備、打合せ、修正、納品までの担当者と日程を確認する。", "入金までに必要な資金を確認し、参加・見送りの理由を記録する。"],
    records: ["費用と作業時間の内訳", "見積根拠", "担当者・実施日程", "参加判断の理由"],
    ready: "費用・時間・体制を確保でき、契約どおりに実施できる見通しがある。",
    exampleTitle: "採算を見るための計算例（税抜）", example: "受注額20万円 − 外注費8万円 − その他経費2万円 ＝ 10万円。ここから自社の人件費・共通経費なども考慮します。この10万円をそのまま利益とは扱いません。",
    tip: "落札できなくても、資料作成や見積りに使う時間・費用はかかります。準備の負担も含めて判断しましょう。",
    source: officialSources.overview, link: { href: "#bids", label: "案件・提出管理を開く" },
  },
  {
    short: "書類準備", title: "参加手続きと必要書類をそろえる", icon: ClipboardCheck,
    lead: "公告の提出物を一覧にして、抜けを防ぎましょう。",
    actions: ["参加申請・資格資料・実績資料など、その案件の提出物を一覧にする。", "指定様式を使い、名義・添付資料・署名や押印の要否を確認する。", "説明会・事前審査・事前連絡が必要なら、その手続きも期限内に済ませる。"],
    records: ["提出物一覧", "資格・実績などの証明資料", "提出書類の控え", "受付記録"],
    ready: "その案件で求められる参加手続きを終え、入札・見積提出に進める。",
    exampleTitle: "提出物リストの作り方", example: "公告に書かれた提出物ごとに「必要書類／担当／締切／提出方法／提出済み」を並べます。一般的なひな形ではなく、その案件の指定内容を転記します。",
    tip: "オープンカウンターでも、事前の連絡や資料提出が必要なことがあります。実施要領を確認します。",
    source: officialSources.documents,
  },
  {
    short: "提出", title: "入札書・見積書等を期限内に届ける", icon: Send,
    lead: "提出したつもりで終わらず、受付状況まで確認します。",
    actions: ["金額・消費税の扱い・参加名義・使用様式を、公告や説明書と照合する。", "指定の方法で提出し、提案書がある場合はその締切と提出先も確認する。", "電子送信の完了画面、送信履歴、到着・受付を確認できる記録を残す。"],
    records: ["入札書・見積書・提案書の控え", "送信履歴・受付結果", "郵送時の到着確認"],
    ready: "必要な書類を期限内に提出し、受付状況を確認できている。",
    exampleTitle: "提出前に照合する5点", example: "①宛先 ②名義 ③金額・税の扱い ④添付資料 ⑤締切と提出方法。郵送は「必着」「消印有効」など、案件の指定を確認します。",
    tip: "メール・FAX・郵送・電子入札を、自分の都合で選べるとは限りません。必ず指定の方法を使います。",
    source: officialSources.overview,
  },
  {
    short: "結果確認", title: "結果を確認し、次の行動を決める", icon: BadgeCheck,
    lead: "選ばれた場合も、選ばれなかった場合も、記録を次の行動につなげます。",
    actions: ["発注者の通知や公式の公表資料で、落札・選定の結果を確認する。", "追加資料や再度の手続きが必要なら、案内された期限内に対応する。", "公表された情報と自社の提出内容を残し、次に見直す点を整理する。"],
    records: ["結果通知", "公表された落札者・金額", "次の対応期限", "振り返りメモ"],
    ready: "結果が確認でき、契約に進むか、次の案件を探すかが決まっている。",
    exampleTitle: "振り返りメモの例", example: "「仕様の確認に時間がかかったので、次回は候補を見つけた日に質問事項を整理する」など、次の行動を1つ決めます。結果や金額が非公表なら、未確認として記録します。",
    tip: "結果を確認しただけで業務を始めず、契約成立と着手条件を確認してください。",
    source: officialSources.overview,
  },
  {
    short: "契約", title: "契約内容と着手条件を確認する", icon: Handshake,
    lead: "「何を、いくらで、いつまでに」を、正式な契約内容で確認します。",
    actions: ["金額、業務範囲、納期、支払条件、必要な保証などを確認する。", "指定された契約書・請書等で、必要な契約手続きを行う。", "契約成立と着手条件を確認し、担当者・納品までの日程を共有する。"],
    records: ["契約書・請書等", "確定した仕様書", "実施日程", "発注者の連絡先"],
    ready: "契約条件と自社の実施範囲が確定し、着手できることが確認できている。",
    exampleTitle: "引継ぎメモの例", example: "担当者に「納品物／納期／連絡先／検査方法／請求の条件」を共有。提案時の認識と契約内容に差があれば、着手前に確認します。",
    tip: "契約書・請書などの手続きは案件によって異なります。発注者の案内に従います。",
    source: officialSources.documents,
  },
  {
    short: "実施・納品", title: "仕事を納め、検査・確認に対応する", icon: PackageCheck,
    lead: "成果物を送って終わりではなく、発注者の検査・確認まで進めます。",
    actions: ["契約と仕様書に沿って実施し、打合せや変更の相談を記録する。", "指定された成果物、納品書・完了報告などを期日までに提出する。", "発注者の検査・確認を受け、修正があれば対応し、完了を確認する。"],
    records: ["成果物", "納品書・完了報告", "打合せ・変更の記録", "検査・確認結果"],
    ready: "契約で求められた納品と検査・確認が完了している。",
    exampleTitle: "研修の納品物を確認する例", example: "研修の実施だけでなく、教材や実施報告書などが成果物に含まれていないかを仕様書で確認。実施前に、提出形式と提出先まで整理します。",
    tip: "作業範囲や納期の変更は自己判断で進めず、発注者と必要な手続きを確認します。",
    source: officialSources.documents,
  },
  {
    short: "請求・入金", title: "請求して、入金まで確認する", icon: Receipt,
    lead: "入金を照合し、次の見積りに使える記録を残して完了です。",
    actions: ["契約の支払条件に従い、指定様式の請求書等を提出する。", "請求書の受領状況と支払予定を確認し、入金日・金額を照合する。", "実際にかかった費用と作業時間を振り返り、案件記録を整理する。"],
    records: ["請求書・受領確認", "入金記録", "実際の費用・作業時間"],
    ready: "入金を確認し、提出資料と実績、次回への改善点がまとまっている。",
    exampleTitle: "案件完了時のメモの例", example: "「見積時より修正が2回多かった」「納品資料の整理に半日かかった」などを記録。次回の費用・日程の見積りに反映します。",
    tip: "入金の時期や部分払いの有無は契約で異なります。納品後すぐ入金される前提では予定を組まないようにします。",
    source: officialSources.documents, link: { href: "#bids", label: "案件・提出管理で記録する" },
  },
];

const methods = [
  { id: "bid", title: "一般競争入札", intro: "公告の条件を満たしたうえで、入札書などを提出する方式。", document: "入札書 ＋ 公告で指定された証明資料等", decision: "最低価格落札方式・総合評価落札方式など、公告に定められた基準で決まります。", checks: ["資格の区分・等級・参加地域", "事前審査や技術提案の要否", "参加申請・入札の期限と開札日時"], source: officialSources.overview },
  { id: "open", title: "オープンカウンター", intro: "公開された見積依頼に対し、見積書を提出する見積合わせ。随意契約を前提とします。", document: "見積書 ＋ 実施要領で指定された資料", decision: "防衛省の案内では、有効な見積りのうち、予定価格の範囲内で最も低い価格の申込者を選びます。個別の実施要領を確認します。", checks: ["全省庁統一資格などの要否", "事前の連絡・申込と同等品の確認", "見積書の期限・宛先・提出方法"], source: officialSources.openCounter },
  { id: "proposal", title: "企画競争・プロポーザル", intro: "募集要領に沿って企画・技術などを提案し、審査を受ける方式。", document: "企画・技術提案書 ＋ 指定された見積・資格資料等", decision: "募集要領の評価基準で審査されます。プレゼンや、その後の契約交渉が必要な場合もあります。", checks: ["参加表明の要否と締切", "評価基準・提案書の様式", "金額の上限・審査後の手続き"], source: officialSources.overview },
];

function SourceLinks({ sources }: { sources: { label: string; href: string }[] }) {
  return <div className="bid-flow-sources"><span>公式の確認先</span>{sources.map(source => <a key={source.href} href={source.href} target="_blank" rel="noopener noreferrer">{source.label}<ExternalLink size={15} aria-hidden="true"/></a>)}</div>;
}

export default function PortalBidFlow() {
  const [selected, setSelected] = useState("0");
  const index = Number(selected);
  const goTo = (next: number, focus = false) => {
    if (next < 0 || next >= steps.length) return;
    setSelected(String(next));
    if (focus) window.requestAnimationFrame(() => {
      const heading = document.getElementById(`bid-guide-title-${next}`);
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  };

  return <div className="bid-flow">
    <section className="bid-flow-guide" id="bid-flow-guide" aria-label="10の手順を読む">
      <div className="bid-flow-guide-bar"><div><BookOpen size={20} aria-hidden="true"/><strong>手順ガイド</strong><span>読んでいる手順 <b>{String(index + 1).padStart(2, "0")}</b> / 10</span></div><Progress value={(index + 1) * 10} aria-label="ガイド内の位置" aria-valuetext={`10手順のうち${index + 1}番目を表示`}/></div>
      <Tabs value={selected} onValueChange={value => goTo(Number(value))} className="bid-flow-step-tabs">
        <TabsList className="bid-flow-step-list" aria-label="読む手順を選択">{steps.map((step, i) => <TabsTrigger key={step.short} value={String(i)}><span>{String(i + 1).padStart(2, "0")}</span>{step.short}</TabsTrigger>)}</TabsList>
        {steps.map((step, i) => <TabsContent key={step.short} value={String(i)} className="bid-flow-step-panel">
          <div className="bid-flow-step-reveal">
            <header className="bid-flow-step-heading"><div className="bid-flow-step-icon"><step.icon size={32} aria-hidden="true"/></div><div><span>STEP {String(i + 1).padStart(2, "0")} ・ {phases.find(phase => i >= phase.first && i <= phase.last)?.label}</span><h2 id={`bid-guide-title-${i}`} tabIndex={-1}>{step.title}</h2><p>{step.lead}</p></div></header>
            <div className="bid-flow-step-body">
              <div className="bid-flow-tasks"><h3>この手順でやること</h3><ol>{step.actions.map((action, n) => <li key={action}><span aria-hidden="true">{n + 1}</span><p>{action}</p></li>)}</ol><div className="bid-flow-ready"><Check size={22} aria-hidden="true"/><div><strong>ここまで確認できたら、次へ</strong><p>{step.ready}</p></div></div></div>
              <aside className="bid-flow-step-side"><div className="bid-flow-documents"><h3><FileText size={20} aria-hidden="true"/>手元に残すもの</h3><ul>{step.records.map(record => <li key={record}>{record}</li>)}</ul></div><div className="bid-flow-example"><span>具体的に考えてみる</span><h3>{step.exampleTitle}</h3><p>{step.example}</p></div></aside>
            </div>
            <div className="bid-flow-tip"><Info size={20} aria-hidden="true"/><p>{step.tip}</p></div>
            {i === 2 && <div className="bid-flow-deadlines" aria-label="別々に記録する締切"><strong>締切は1つにまとめず、分けて記録</strong><div>{[{title:"質問の期限",text:"不明点を問い合わせる期限"},{title:"参加申請の期限",text:"参加意思・資格資料などを出す期限"},{title:"入札・見積の期限",text:"金額や提案などを提出する期限"}].map(deadline => <section key={deadline.title}><h3>{deadline.title}</h3><p>{deadline.text}</p></section>)}</div><p>必要な手続きや期限の順序は案件ごとに異なります。日付に加え、時刻と提出方法も残しましょう。</p></div>}
            {i === 6 && <div className="bid-flow-result"><section><span>落札・選定された</span><h3>契約の案内を確認する</h3><p>契約手続きと着手条件を確認し、次の手順へ。</p><button type="button" onClick={() => goTo(7, true)}>STEP 08 契約へ<ArrowRight size={17}/></button></section><section><span>今回は選ばれなかった</span><h3>記録を残して、次の案件へ</h3><p>公表結果と提出内容を振り返り、改善点を1つ決めます。</p><a href="#useful-info/bid-review">振り返りのコラムを読む<ArrowRight size={17}/></a><button type="button" onClick={() => goTo(1, true)}>STEP 02 案件探しに戻る<ArrowRight size={17}/></button></section></div>}
            {step.link && <div className="bid-flow-step-action"><a href={step.link.href}>{step.link.label}<ArrowRight size={18} aria-hidden="true"/></a></div>}
            <SourceLinks sources={[step.source]}/>
          </div>
        </TabsContent>)}
      </Tabs>
      <nav className="bid-flow-pager" aria-label="手順を読み進める"><button type="button" className="bid-flow-prev" disabled={index === 0} onClick={() => goTo(index - 1, true)}><ArrowLeft size={19} aria-hidden="true"/>前の手順へ</button><span aria-live="polite" aria-atomic="true">{index + 1} / 10<span>手順の説明</span></span>{index < steps.length - 1 ? <button type="button" className="bid-flow-next" onClick={() => goTo(index + 1, true)}><span>次の手順へ<small>{steps[index + 1].short}</small></span><ArrowRight size={21} aria-hidden="true"/></button> : <a className="bid-flow-next" href="#collected">案件を探してみる<ArrowRight size={21} aria-hidden="true"/></a>}</nav>
    </section>

    <section className="bid-flow-section" aria-labelledby="bid-flow-method-title"><Accordion type="single" collapsible className="bid-flow-section-disclosure"><AccordionItem value="methods"><AccordionTrigger className="bid-flow-section-heading"><span className="bid-flow-disclosure-icon"><FileCheck2 size={26} aria-hidden="true"/></span><span className="bid-flow-disclosure-copy"><span className="bid-flow-disclosure-title" id="bid-flow-method-title">どの方式？ 公告の名前に合わせて確認</span><span className="bid-flow-disclosure-description">共通の流れは同じでも、提出物や審査の方法が変わります。</span></span><span className="bid-flow-disclosure-state" aria-hidden="true"><span className="when-closed">開く</span><span className="when-open">閉じる</span></span></AccordionTrigger><AccordionContent className="bid-flow-section-content">
      <Tabs defaultValue="bid" className="bid-flow-method-tabs"><TabsList className="bid-flow-method-list" aria-label="募集方式を選ぶ">{methods.map(method => <TabsTrigger key={method.id} value={method.id}>{method.title}</TabsTrigger>)}</TabsList>{methods.map(method => <TabsContent key={method.id} value={method.id} className="bid-flow-method-panel"><p className="bid-flow-method-intro">{method.intro}</p><dl><div><dt>主な提出物</dt><dd>{method.document}</dd></div><div><dt>選ばれ方</dt><dd>{method.decision}</dd></div></dl><h3>先に確認する3つのこと</h3><ul>{method.checks.map(check => <li key={check}><Check size={18} aria-hidden="true"/>{check}</li>)}</ul>{method.id === "open" && <p className="bid-flow-method-note"><strong>オープンカウンター ＝ 必ず資格不要、ではありません。</strong>全省庁統一資格の要否や地域など、個別の参加条件を確認します。</p>}<SourceLinks sources={[method.source]}/></TabsContent>)}</Tabs>
    </AccordionContent></AccordionItem></Accordion></section>

    <section className="bid-flow-section" aria-labelledby="bid-flow-faq-title"><Accordion type="single" collapsible className="bid-flow-section-disclosure"><AccordionItem value="faq"><AccordionTrigger className="bid-flow-section-heading"><span className="bid-flow-disclosure-icon"><BookOpen size={26} aria-hidden="true"/></span><span className="bid-flow-disclosure-copy"><span className="bid-flow-disclosure-title" id="bid-flow-faq-title">最初につまずきやすいところ</span><span className="bid-flow-disclosure-description">書類の意味と、このポータルでできることを確認しましょう。</span></span><span className="bid-flow-disclosure-state" aria-hidden="true"><span className="when-closed">開く</span><span className="when-open">閉じる</span></span></AccordionTrigger><AccordionContent className="bid-flow-section-content"><Accordion type="multiple" className="bid-flow-faq">
      <AccordionItem value="documents"><AccordionTrigger>「公告」「仕様書」「入札説明書」は、どう違う？</AccordionTrigger><AccordionContent><dl><div><dt>公告・見積依頼書</dt><dd>何を募集するか、誰が参加できるか、期限はいつかを確認する入口です。</dd></div><div><dt>仕様書</dt><dd>仕事の内容、数量、成果物、納期などを確認する資料です。</dd></div><div><dt>入札説明書・実施要領</dt><dd>必要書類、提出方法、審査などの詳しい手続きを確認します。</dd></div></dl><p>名称や記載場所は機関によって異なるため、関連資料をまとめて確認します。</p></AccordionContent></AccordionItem>
      <AccordionItem value="qualification"><AccordionTrigger>全省庁統一資格があれば、どの案件でも参加できる？</AccordionTrigger><AccordionContent><p>資格の名義・営業品目・等級・競争参加地域・有効期間を、個別の公告と照合します。実績や許認可など、追加条件がある場合もあります。自治体案件も対象です。自治体独自の登録・所在地・法人実績・再委託条件を個別に確認してください。</p><SourceLinks sources={[officialSources.qualification]}/></AccordionContent></AccordionItem>
      <AccordionItem value="portal"><AccordionTrigger>Larkへ登録したら、入札の申込みも終わる？</AccordionTrigger><AccordionContent><p><strong>Larkへの登録は、案件の管理です。</strong>担当・期限・資料を整理したうえで、発注者が指定する方法で正式な参加申請や入札書・見積書の提出を行います。登録と提出を別々に確認しましょう。</p></AccordionContent></AccordionItem>
      <AccordionItem value="questions"><AccordionTrigger>分からないことがあるときは、誰に聞けばいい？</AccordionTrigger><AccordionContent><p>仕事の範囲や参加条件は、公告に記載された発注者の窓口へ、指定の期間と方法で質問します。ポータルの使い方や進め方の整理は、SFLの受講後サポートをご確認ください。</p><a className="bid-flow-inline-link" href="#support">受講後サポートを見る<ArrowRight size={17}/></a></AccordionContent></AccordionItem>
    </Accordion></AccordionContent></AccordionItem></Accordion></section>

    <section className="bid-flow-section" aria-labelledby="bid-flow-summary-title"><Accordion type="single" collapsible className="bid-flow-summary"><AccordionItem value="all"><AccordionTrigger><span id="bid-flow-summary-title">10の手順を一覧で見返す</span></AccordionTrigger><AccordionContent><Table className="bid-flow-table" aria-label="入札から入金までの手順一覧"><TableHeader><TableRow><TableHead scope="col">手順</TableHead><TableHead scope="col">次へ進む目安</TableHead><TableHead scope="col">残すもの</TableHead></TableRow></TableHeader><TableBody>{steps.map((step, i) => <TableRow key={step.short}><TableHead scope="row"><button type="button" onClick={() => goTo(i, true)}><span>STEP {String(i + 1).padStart(2, "0")}</span>{step.short}<ChevronRight size={17}/></button></TableHead><TableCell data-label="次へ進む目安">{step.ready}</TableCell><TableCell data-label="残すもの">{step.records.join("、")}</TableCell></TableRow>)}</TableBody></Table></AccordionContent></AccordionItem></Accordion></section>

    <aside className="bid-flow-management"><div><span>SFLの案件管理</span><h2>担当・期限・次の行動を、1件ずつ。</h2><p>まずは気になる案件を1つ選び、公式資料を開いてみましょう。確認した条件と、次にする作業をポータルやLarkに残して進めます。</p></div><div className="bid-flow-actions"><a href="#collected">案件を探す<ArrowRight size={18}/></a><a href="#bids">案件・提出管理へ<ArrowRight size={18}/></a></div></aside>
    <p className="bid-flow-credit">合同会社SFLによる実務ガイド ／ 公式情報の確認日：2026年9月16日。具体例は理解を助けるための例示です。実際の手続きは個別の募集・契約条件を確認してください。</p>
  </div>;
}
