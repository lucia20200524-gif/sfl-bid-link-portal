"use client";

import { ArrowUpRight, BookOpen, CalendarClock, Database, Search, ShieldCheck } from "lucide-react";
import { discoveryPageSize } from "@/lib/discovery-domain";
import { searchModes } from "@/lib/collection-profiles";
import { larkTargetNames } from "@/lib/lark-registration";
import { procurementSources } from "@/lib/procurement-sources";

const sourceDetails = {
  kkj: { status: "対応", method: "公式API", description: "収録された公告をキーワードで取得。結果が多い場合は条件を分けて調べます。" },
  "p-portal": { status: "準備中", method: "公式サイトで検索", description: "自動検索・取り込みは準備中です。公式サイトへのアクセスは利用できます。" },
  mod: { status: "一部対応", method: "API＋公式ページ", description: "官公需に収録された防衛省の公告と、防衛省内局の見積募集を確認します。" },
  gsdf: { status: "一部対応", method: "API＋公式ページ・PDF", description: "官公需の収録分に加え、指定の16部隊・機関から公告をたどります。" },
  msdf: { status: "一部対応", method: "API＋公式ページ・PDF", description: "官公需の収録分に加え、公募・企画競争、公告、常続的公示の3区分をたどります。" },
  asdf: { status: "一部対応", method: "API＋公式ページ・PDF", description: "官公需の収録分に加え、指定の28基地・機関から公告をたどります。" },
} as const;

const resultViews = [
  { title: "全件", text: "指定した検索条件に一致する保存案件を表示します。詳しい検索条件では、都道府県の複数選択と提出期限を指定できます。" },
  { title: "おすすめ・新着", text: "件名に希望するキーワードがある候補。件名の一致と一致語数を優先し、同じ条件では締切が近い順に並びます。" },
  { title: "関連候補", text: "公告本文にキーワードがある候補。件名だけでは見つけにくい仕事も確認できます。" },
  { title: "要確認", text: "締切不明、先行手続きの期限到来、確認後の公告更新など、原文の確認が必要な候補です。" },
  { title: "確認済み・Lark登録済み", text: "自分が確認済み・対象外にした案件と、そのタブのLarkへ登録済みの案件を確認できます。" },
];

export default function PortalSpecs({ onSearch }: { onSearch: () => void }) {
  return <div className="portal-specs">
    <section className="panel specs-intro" aria-labelledby="specs-intro-title">
      <div><span className="specs-icon"><BookOpen size={24}/></span><h2 id="specs-intro-title">案件を見つけて、確認して、Larkへ。</h2><p>このポータルは、公告を集めて候補を整理するための仕事道具です。参加条件の確認と入札の手続きは、公式公告に沿って行います。</p></div>
      <button type="button" className="button primary" onClick={onSearch}>案件を探す<ArrowUpRight size={18}/></button>
    </section>

    <section className="panel"><h2>オープンカウンター特集</h2><p>最初の画面では、保存済みのオープンカウンター案件を分野のキーワードで限定せず表示します。「締切7日以内」「新着7日・確認後の更新」「要確認」、発注機関、並び順で切り替えられます。固定のD・D・Cと参加資格の除外条件は、フリーモードを含む全4モードと共通です。</p><p>カードから条件・期限や公告原文を確認し、選んだSFL・エンジニア・AcademyのLarkテーブルへ登録できます。「一覧を更新」は保存情報の再読み込みです。新しい公告の取得は「新しい公告を探す」から検索画面で行います。</p></section>

    <div className="specs-highlights">
      <article className="panel"><Database size={23}/><h2>結果は共有保存</h2><p>取得した候補は4モードで共有。後から開き直しても確認できます。</p></article>
      <article className="panel"><ShieldCheck size={23}/><h2>案件検索は会員専用</h2><p>管理者から発行されたID・パスワードでログインしてください。使い方・ガイドはログインなしで閲覧できます。</p></article>
      <article className="panel specs-pending"><CalendarClock size={23}/><h2>定期実行は準備中</h2><p>現在は画面から収集を開始します。画像PDFの自動読み取りも準備中です。</p></article>
    </div>

    <section className="panel" aria-labelledby="specs-flow-title"><div className="panel-heading"><h2 id="specs-flow-title">基本の使い方</h2><Search size={22}/></div>
      <ol className="specs-steps">
        <li><span>01</span><div><h3>タブとキーワードを選ぶ</h3><p>SFL・エンジニア・Academyは分野別のキーワードを利用できます。「フリーモード」はキーワードを自由に入力し、分野に縛られずに調べます。参加資格・等級条件は、ほかのモードと同じ固定条件を適用します。</p></div></li>
        <li><span>02</span><div><h3>保存結果を見る・新しい公告を集める</h3><p>「検索」は、保存された候補の絞り込み。「最新情報を取得」は、外部の取得先を調べて結果を追加します。</p></div></li>
        <li><span>03</span><div><h3>公式公告を確認してLarkへ登録</h3><p>案件の「詳細」を押し、「公式公告を開く」から仕事内容・資格・期限を確認。進めたい案件は詳細画面で「Larkへ登録」を押します。Larkへの登録だけでは入札応募は完了しません。</p></div></li>
      </ol>
      <p className="specs-note">収集結果は4モード共通です。「検索先を選ぶ」は保存結果の表示対象を切り替えます。迷ったら「取得済み案件｜全検索先」から確認してください。</p>
    </section>

    <section className="panel" aria-labelledby="specs-sources-title"><div className="panel-heading"><div><h2 id="specs-sources-title">{procurementSources.length}つの検索先と、現在の対応状況</h2><p>{searchModes.length}タブ × {procurementSources.length}検索先で{searchModes.length * procurementSources.length}通り。ただし、調達ポータルの自動取得は準備中です。</p></div></div>
      <div className="specs-table-wrap" tabIndex={0} role="region" aria-label="検索先別の仕様一覧"><table className="specs-table"><thead><tr><th scope="col">検索先</th><th scope="col">状態</th><th scope="col">調べ方・範囲</th></tr></thead><tbody>{procurementSources.map(source=>{const detail=sourceDetails[source.id];return <tr key={source.id}><th scope="row"><a href={source.href} target="_blank" rel="noopener noreferrer">{source.name}<ArrowUpRight size={15}/></a></th><td><span className={`specs-status${detail.status==="準備中"?" pending":detail.status==="一部対応"?" partial":""}`}>{detail.status}</span></td><td><strong>{detail.method}</strong><p>{detail.description}</p></td></tr>;})}</tbody></table></div>
      <p className="specs-note">対応している取得先でも、すべての公告を網羅するものではありません。アクセス制限や読めない資料は「設定・仕様」の「公告の取得状況」に残します。</p>
    </section>

    <section className="panel" aria-labelledby="specs-results-title"><h2 id="specs-results-title">調査結果一覧の見方</h2><div className="specs-result-grid">{resultViews.map(view=><article key={view.title}><h3>{view.title}</h3><p>{view.text}</p></article>)}</div><p className="specs-note">1ページ{discoveryPageSize}件ずつ表示します。カード・一覧表とも、最初に種別・案件名・募集機関名を表示し、「詳細」から条件を確認できます。「新着7日・確認後の更新」で絞り込むこともできます。新着は、このポータルで初めて取得してから7日以内の案件です。</p></section>

    <div className="specs-details">
      <details className="panel"><summary>提出期限・参加資格はどう判定する？</summary><div className="specs-detail-body"><ul>
        <li>日本時間で、入札・見積の締切が今日より未来の日付の案件を主一覧に表示します。当日締切と期限切れは除きます。</li>
        <li>締切が読めない場合は、日付を推測せず「要確認」に残します。原文で確認できた日付と根拠を入力して保存できます。</li>
        <li>参加申請・仕様書の受領・同等品申請など、先に必要な手続きの期限も、読み取れた範囲で表示します。入札開始日・開札日・納入期限を提出期限として扱いません。</li>
        <li>全4モードで国の対象案件と自治体案件を表示します。自治体独自の資格が必要でも一律に除外せず「要確認」に含めます。「自治体案件」ボタンは取得済みの検索結果を絞り込みます。官公需情報ポータルに収録された公告が対象で、全国すべての自治体を網羅するものではありません。</li>
      <li>全省庁統一資格の固定条件は「物品の販売：等級D／役務の提供等：等級D／物品の買受け：等級C」です。等級は変更できません。この固定等級と公告の対象等級が明確に合わない案件は検索結果から除外します。等級の範囲表記、例外条件、複数の資格区分がある場合は、自動確定せず原文で確認します。</li>
      <li>都道府県・市区町村の独自資格や建設工事等の別資格が必須の案件は除外します。統一資格との選択が明記されている場合は対象です。自治体のオープンカウンターは、独自資格・名簿登録が不要と確認できる場合に表示します。</li><li>国の機関名だけでは参加可能と判定しません。資格条件が読めない案件は表示せず、保存情報は保持します。所在地の都道府県名だけで国の出先機関を除外することはありません。</li><li>表示は参加資格の保証ではありません。公告の資格区分・等級・地域・有効期間、実績、許認可、提出条件を資格通知書と照合してください。</li></ul></div></details>
      <details className="panel"><summary>保存・重複整理・確認済みのルール</summary><div className="specs-detail-body"><ul>
        <li>取得結果はポータルの利用者で共有し、同じ公式URLと案件名の候補をまとめます。別URLで掲載された同一案件は残ることがあります。</li>
        <li>確認済み・対象外とその理由は、利用者ごと・タブごとに保存します。公告の変更を検知すると、再確認が必要な状態になります。</li>
        <li>「最終処理」はポータルが処理した時刻です。公式ページの更新時刻を示すものではありません。</li>
        <li>保存結果はキーワードに合う最大20,000件を確認し、都道府県・提出期限で絞り込み、キーワードの一致順に表示します。上限に達した場合は画面に案内します。</li>
        <li>検索条件は利用者ごとに保存します。フリーモードを含む全4モードの参加資格・等級条件は、全利用者共通の固定値です。有効期限は既存の記録を確認表示し、この画面からは編集できません。同じ会員IDでログインすると、別の端末でも保存条件を確認できます。</li>
        <li>取得後の変更履歴を案件の詳細から確認できます。履歴保存を始める前の更新や、まだ再取得していない変更は表示されません。</li>
      </ul></div></details>
      <details className="panel"><summary>参加準備・期限・落札結果を管理する</summary><div className="specs-detail-body"><ol>
        <li>検索結果の「詳細」から登録した参加資格と原文の記載を照合します。不明な条件は「要確認」です。</li>
        <li>「案件・提出管理へ追加」で必要書類・質問・説明会・参加申請・提出の作業を編集し、案件を保存します。Lark登録とは別の操作です。</li>
        <li>「期限・結果分析」で未完了の作業を確認します。担当者・日付・時刻を設定でき、期限をカレンダー用ファイルに書き出せます。</li>
        <li>案件の状況を落札・失注などに更新し、結果の出典・落札企業・金額・税区分を記録すると結果分析に反映されます。</li>
      </ol><p>集計対象はこのポータルで管理・記録した案件です。全国の落札実績データではありません。案件・提出管理の情報はこのポータルの利用者で共有します。</p><p>質問文と提案書の構成メモは定型のひな形です。AIによる仕様書解析や、応募・書類提出の自動実行ではありません。</p></div></details>
      <details className="panel"><summary>Larkには何が、どこへ登録される？</summary><div className="specs-detail-body"><p>会員はSFLの案件管理テンプレートを自分のLarkへ複製して使います。「設定」で初回の接続を済ませると、選択中のタブに対応する自分のテーブルへ登録できます。管理者の登録先はSFLのBaseです。フリーモードは、接続設定に追加した「フリーモード【案件管理】」へ登録します。詳細画面で既存の保存先を選ぶこともできます。</p><dl className="specs-lark-map">{searchModes.map(mode=><div key={mode.id} data-mode={mode.id}><dt>{mode.label}</dt><dd>{larkTargetNames[mode.id]}</dd></div>)}</dl><p>登録項目は<strong>都道府県・種別管理・案件先機関名・案件先URL・提出期限</strong>です。既存のLarkフィールド構成を保ち、担当者や入札額・落札額・外注額は送信しません。</p><p>登録済みの案件は再登録を防ぎます。ボタンが押せない場合は、期限・確認状態・Lark接続の案内をご確認ください。</p></div></details>
      <details className="panel"><summary>収集が止まった・0件になったとき</summary><div className="specs-detail-body"><ol>
        <li>「関連候補」「要確認」に候補がないか確認します。</li>
        <li>検索先・キーワード・資格の絞り込み条件を見直します。</li>
        <li>「設定・仕様」の「公告の取得状況」で、処理待ち・失敗・未確認の取得先を確認します。</li>
        <li>途中で画面を閉じた場合は「最新情報を取得」で再開します。結果と処理位置は保存されています。</li>
      </ol><p>0件は、全国に案件が存在しないことを意味しません。取得範囲・締切・検索条件により、表示できる候補がない場合があります。</p></div></details>
      <details className="panel"><summary>取得範囲と、準備中の機能</summary><div className="specs-detail-body"><ul>
        <li>通常の公開ページと文字入りPDFを取得します。画像だけのPDFの自動読み取りや、一部の画面描画が必要なページは接続準備が残っています。</li>
        <li>総合ページから各基地・部隊の調達欄、入札公告・見積依頼の一覧、個別公告・PDFへ進みます。学校紹介や共通書式より公告の掲載欄を優先し、基地ごとに順番に確認します。各隊最大1,981ページ、確認先ごと60ページ・8階層、PDFはページ数の制限なく1ページずつ読み取ります（1ファイル8MB・抽出本文150万文字まで）。取得上限や読み取り不可は「未確認」と表示します。</li>
        <li>公式サイトへの負荷を抑えるため順番に取得し、取得済みページは原則6時間再利用します。短時間の再巡回には制限があります。</li>
        <li>現在、画面を閉じている間に定期収集する機能は準備中です。調達ポータルの自動取り込みも準備中です。</li>
        <li>キーワードの自動生成は、登録済みの語句を入力する機能です。OpenAIのAPIキーを使うAI調査は組み込んでいません。</li>
      </ul></div></details>
    </div>
  </div>;
}
