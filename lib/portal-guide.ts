import type { CollectionMode } from "./collection-profiles";
import type { ProcurementSourceId } from "./procurement-sources";

export type GuideView = "participation-check" | "cost-simulator" | "document-review" | "collection-status" | "engineer" | "flow" | "insights" | "useful-info" | "support" | "welcome" | "dashboard" | "collected" | "bids" | "links" | "keywords" | "signatures" | "settings" | "specs";
export type GuideTarget = { view: GuideView } | { anchor: "keywords" | "sources" | "results" };
type GuideStep = { title: string; text: string; action?: { label: string; target: GuideTarget } };
export type PortalGuide = { state: string; title: string; message: string; steps: GuideStep[] };
export type GuideContext = {
  view: GuideView;
  mode: CollectionMode;
  sourceId: ProcurementSourceId;
  authenticated: boolean;
  authLoading: boolean;
  owner: boolean;
  loading: boolean;
  failed: boolean;
  partial: boolean;
  attempted: boolean;
  hasResults: boolean;
};

const modeHints: Record<CollectionMode, string> = {
  free: "探したい仕事や物品名を自由に入力してください。参加資格・等級は、ほかのモードと同じ固定条件を適用します。",
  sfl: "AI・DX研修、業務改善、Web制作など、SFLの得意な分野から始めましょう。",
  engineer: "Web制作や小〜中規模のシステム開発から。業務範囲や保守の条件も確かめましょう。",
  academy: "物品・印刷・清掃など、自分が対応できる仕事のキーワードから始めましょう。",
};

const commonSearchSteps: GuideStep[] = [
  { title: "仕事のキーワードを選ぶ", text: "迷ったら「キーワードを自動生成」。語句は自分の得意分野に合わせて編集できます。", action: { label: "キーワード欄へ", target: { anchor: "keywords" } } },
  { title: "検索と最新情報の取得", text: "キーワードの下にある「検索先を選ぶ」を開いて検索先を選び、「検索」で保存済みの案件を確認します。新しい公告を追加したいときは「最新情報を取得」を押します。「要確認」も確認しましょう。", action: { label: "検索先の選択へ", target: { anchor: "sources" } } },
  { title: "公式公告を確認してLarkへ登録", text: "案件の「詳細」を押し、「公式公告を開く」から内容・参加資格・締切を確認。詳細画面の「Larkへ登録」を押すと、選んでいるタブの専用テーブルに入ります。", action: { label: "調査結果一覧へ", target: { anchor: "results" } } },
];

export function portalGuide(context: GuideContext): PortalGuide {
  const { view } = context;
  const searchSteps = context.mode === "free" ? commonSearchSteps.map((step,index)=>({...step,text:index===0?"探したい仕事や物品名を入力してください。複数の語句は読点「、」で区切れます。":index===2?"案件の詳細から公式公告を確認し、ご自身の資格と照合してください。Larkへ登録するときは、詳細画面で保存先を選べます。":step.text})) : commonSearchSteps;
  if (!context.authenticated && ["dashboard", "collected", "bids", "settings"].includes(view)) {
    return { state: "welcome", title: "こんにちは。SFLナビです。", message: context.authLoading ? "利用状況を確認しています。操作で迷ったら、ここから使い方を確認できます。" : "案件探しから登録まで、次の操作をご案内します。案件検索には会員ログインが必要です。", steps: [
      { title: "案件を探す", text: "「案件を探す」から検索対象とキーワードを選んでください。検索には会員ログインが必要です。", action: { label: "案件を探す", target: { view: "collected" } } },
      { title: "自分に合うタブを選ぶ", text: "SFL専用・エンジニア専用・Academy専用に加え、自由なキーワードで探すフリーモードを選べます。" },
      { title: "公式の検索先を見てみる", text: "「公告リンク・確認リスト」から、公式サイトを開いて確認できます。", action: { label: "公告リンク・確認リストへ", target: { view: "links" } } },
    ] };
  }
  if (view === "collected") {
    if (context.sourceId === "p-portal") return { state: "external", title: "調達ポータルの自動検索は準備中です。", message: "「公式サイトを開く」から検索できます。このポータルにはまだ自動で取り込まれません。", steps: [
      { title: "検索キーワードを用意する", text: "自動生成した語句や、自分の希望する仕事内容を使って検索してください。", action: { label: "キーワード欄へ", target: { anchor: "keywords" } } },
      { title: "公式サイトで検索する", text: "「公式サイトを開く」から進みます。締切の条件も公式サイト側で設定してください。" },
      { title: "ポータルで一覧を見る場合", text: "「取得済み案件｜全検索先」に戻すと、利用できる取得先の保存結果を確認できます。", action: { label: "検索先の選択へ", target: { anchor: "sources" } } },
    ] };
    if (context.loading) return { state: "searching", title: "公告の取得を進めています。", message: "取得できた候補から順に保存・表示します。画面を閉じた場合は、次回「最新情報を取得」から再開できます。", steps: searchSteps.map(step => ({ title: step.title, text: step.text })) };
    if (context.failed) return { state: "failed", title: "検索が完了していないようです。", message: "案件が0件という意味ではありません。「設定・仕様」の「公告の取得状況」を確認し、時間をおいて再検索しましょう。", steps: searchSteps };
    if (context.hasResults) return { state: "results", title: "次は、公式公告の条件を確かめましょう。", message: "案件の「詳細」から公式公告を開いて参加資格や締切を確認し、進めたい案件を「Larkへ登録」できます。", steps: searchSteps };
    if (context.attempted) return { state: "empty", title: "キーワードや検索先を変えてみましょう。", message: context.partial ? "取得できた範囲では、未来の締切を確認できる案件がありませんでした。検索先全体が0件という意味ではありません。" : "今回の条件では、未来の締切を確認できる案件がありませんでした。語句を短くしたり、検索先を変えたりしてみましょう。", steps: searchSteps };
    return { state: "ready", title: "まずは、得意な仕事から探しましょう。", message: modeHints[context.mode], steps: searchSteps };
  }
  const guides: Record<Exclude<GuideView, "collected">, PortalGuide> = {
    "participation-check": { state:"participation-check", title:"参加条件を原文と照合しましょう。", message:"条件・自社の状況・根拠を記録し、不明点を整理します。", steps:[{title:"確認内容を残す",text:"確認した結果はコピーやテキスト出力で残せます。"}] },
    "cost-simulator": { state:"cost-simulator", title:"作業時間も含めて試算しましょう。", message:"金額を税抜にそろえ、経費と作業時間を入力します。", steps:[{title:"費用を確認",text:"未入力の費用は0として試算します。"}] },
    "document-review": { state:"document-review", title:"公式資料を開いて確認しましょう。", message:"仕事内容、各手続きの期限、必要書類を整理します。", steps:[{title:"根拠も記録",text:"資料名・ページを記録して、質問事項をまとめます。"}] },
    "collection-status": { state: "collection-status", title: "取得先ごとの進み具合を確認できます。", message: "処理済み・処理待ち・保存件数をまとめています。未確認の項目は、各取得先の見出しを開いて確認してください。", steps: [
      { title: "進み具合を確認", text: "表示は自動で更新されます。「更新」を押して最新の状況を読み込むこともできます。" },
      { title: "案件探しへ戻る", text: "検索結果や条件を確認するときは、こちらから戻れます。", action: { label: "案件を探す", target: { view: "collected" } } },
    ] },
    flow: { state: "flow", title: "今の段階と、次にすることを確認しましょう。", message: "参加準備から入金までを10のステップで案内します。下の段階ボタンから、知りたい手順へ進めます。", steps: [
      { title: "必要な準備を確認", text: "資格・提出物・締切を、案件の公式資料で照合します。" },
      { title: "候補を探す", text: "流れが分かったら、対応できる仕事から探してみましょう。", action: { label: "案件を探す", target: { view: "collected" } } },
    ] },
    insights: { state:"insights", title:"次の手続きと、対応した結果を確認しましょう。", message:"作業の期限・担当者と、登録済みの落札結果を確認できます。まずは日付が近い未完了の作業から確認してください。", steps:[
      {title:"作業を確認",text:"作業・期限から案件を開き、対応状況を更新します。"},
      {title:"結果を記録",text:"案件の詳細に落札企業・公表金額・出典を記録すると、結果分析に反映されます。",action:{label:"案件・提出管理へ",target:{view:"bids"}}},
    ] },
    "useful-info": { state: "useful-info", title: "Larkの活用から、入札の実践まで。", message: "上段にはLarkのおすすめ3本をいつでも表示。下段の入札コラムは、3本ずつページを切り替えて読めます。", steps: [
      { title: "知りたい情報を選ぶ", text: "下の一覧から知りたいテーマを選び、「記事を読む」を押してください。" },
      { title: "一覧に戻る", text: "左側の「お役立ち情報」から、いつでもこの一覧に戻れます。" },
    ] },
    support: { state: "support", title: "受講後の相談先を確認しましょう。", message: "チャット相談と、入札参加・結果確認サポートの内容をまとめています。", steps: [
      { title: "チャットで相談する", text: "受講後30日間は無料。平日10:00〜17:00に対応し、2営業日以内に回答します。" },
      { title: "参加申請・結果確認を依頼する", text: "月額9,000円（税別）のサポートです。手続きと調査の対応内容を確認してください。" },
    ] },
    welcome: { state: "welcome-guide", title: "初めての操作を、一緒に進めましょう。", message: "下の「画面を見ながら始める」から、押す場所を順番にご案内します。気になる項目から始めることもできます。", steps: [
      { title: "説明表で流れをつかむ", text: "対象選び、検索、公式公告の確認、Lark登録までの順番を確認します。" },
      { title: "実際の画面で場所を見る", text: "強調された場所を確認し、「次へ」で案内を進めてください。" },
      { title: "迷ったらいつでも戻る", text: "左メニューの「はじめての方へ」から再開できます。" },
    ] },
    engineer: { state: "engineer", title: "エンジニア向け技術仕様書です。", message: "構成・収集・検索・Lark連携の順に確認できます。", steps: [{title:"実装と運用状況を確認",text:"各章の参照ファイルと、確認が必要な運用設定を引き継ぎに使ってください。"}] },
    specs: { state: "specs", title: "ポータルの仕組みを、ここで確認できます。", message: "使い方、検索先の対応状況、期限の判定、Larkへの登録先をまとめています。詳しい項目は見出しを押して開いてください。", steps: [
      { title: "基本の流れを確認", text: "キーワードを選び、候補を集め、公式公告を確認してから登録します。" },
      { title: "対応状況を確認", text: "自動取得できる範囲と準備中の機能は、検索先別の一覧で確認できます。" },
      { title: "案件探しを始める", text: "仕様を確認したら、自分の分野の候補を探しましょう。", action: { label: "案件を探す", target: { view: "collected" } } },
    ] },
    dashboard: { state: "dashboard", title: "見積合わせの案件を探しましょう。", message: "保存済みのオープンカウンター案件を、締切や新着で絞り込めます。条件を確かめて、進めたい案件をLarkへ登録しましょう。", steps: [
      { title: "案件を選ぶ", text: "「締切7日以内」「新着7日・確認後の更新」で絞り込み。「要確認」には締切未確認などの案件を表示します。" },
      { title: "条件・期限を確認", text: "「条件・期限を詳しく見る」から原文と照合してください。オープンカウンターも、資格・提出方法の確認が必要です。" },
      { title: "登録先を選んでLarkへ", text: "SFL・エンジニア・Academyから登録先を選び、案件の「Larkへ登録」を押します。" },
    ] },
    bids: { state: "bids", title: "締切と、次にすることを整理しましょう。", message: "案件名を押すと詳細を編集できます。進捗・担当者・提出期限で絞り込むと確認しやすくなります。", steps: [
      { title: "対象の案件を絞る", text: "進捗や締切、担当者で絞り込み、今対応する案件を探します。" },
      { title: "案件の詳細を更新", text: "案件名から詳細を開き、参加条件や次にすること、提出状況を記録して保存します。" },
      { title: "候補を増やす", text: "新しい仕事は「案件を探す」で検索できます。", action: { label: "案件を探す", target: { view: "collected" } } },
    ] },
    links: { state: "links", title: "公式サイトの公告を確認しましょう。", message: "サイトを開いて公告・仕様書を調べたら「確認済みにする」。この一覧で、どこまで確認したかを整理できます。", steps: [
      { title: "検索語を用意する", text: "調査キーワードをコピーして、各サイトの検索に使います。", action: { label: "検索キーワード集へ", target: { view: "keywords" } } },
      { title: "公式サイトで確認", text: "「公式サイトを開く」から、仕事内容・参加資格・提出期限・提出方法を原文で確認してください。" },
      { title: "確認済みをチェック", text: "調べ終えたサイトは「確認済みにする」。候補があれば「案件を登録」から記録できます。" },
    ] },
    keywords: { state: "keywords", title: "仕事の呼び方を変えると、候補が広がります。", message: "語句を押すとコピーできます。「案件を探す」では、キーワード集からの自動生成も使えます。", steps: [
      { title: "分野を選ぶ", text: "研修・Web制作・物品など、自分の仕事に近い分野から探します。" },
      { title: "語句をコピー", text: "1語ずつ、または分野ごとの一覧をコピーして使えます。" },
      { title: "検索画面で入力", text: "「案件を探す」のキーワード欄に貼り付けるか、自動生成を使ってください。", action: { label: "案件を探す", target: { view: "collected" } } },
    ] },
    signatures: { state: "signatures", title: "連絡する担当者と、参加名義を確認しましょう。", message: "署名をコピーしたら、連絡先を確認・追記してからメールに使ってください。", steps: [
      { title: "担当者を選ぶ", text: "タブで連絡する担当者の署名に切り替えます。" },
      { title: "参加名義を選ぶ", text: "案件に参加するLUCIA・SFLの名義に合わせてコピーします。" },
      { title: "連絡先を確認", text: "必要な電話番号・メールアドレスを追記し、内容を確認してから送信してください。" },
    ] },
    settings: { state: "settings", title: "共有メンバーと、Larkの接続を確認できます。", message: context.owner ? "管理者は利用メンバーを登録し、「接続を確認」でLarkの接続状態を確認できます。" : "利用メンバーを確認できます。メンバーやLark接続の変更は管理者に依頼してください。", steps: [
      { title: "メンバーを確認", text: "案件を共有するメンバーの氏名とメールアドレスを確認します。" },
      { title: "Larkへの登録先", text: "SFL・エンジニア・Academyは対応するテーブルへ登録されます。フリーモードでは案件の詳細で保存先を選べます。" },
      { title: "案件探しへ戻る", text: "準備ができたら、得意分野の候補を探しましょう。", action: { label: "案件を探す", target: { view: "collected" } } },
    ] },
  };
  return guides[view];
}
