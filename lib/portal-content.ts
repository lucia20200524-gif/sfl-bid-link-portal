import { Search, ShieldCheck, Landmark } from "lucide-react";

export const searchLinks = [
  {
    title: "官公需情報ポータル｜国・自治体の案件検索",
    description: "このアプリの案件検索で利用する、国・独立行政法人・自治体等の公告情報。",
    href: "https://www.kkj.go.jp/s/",
    meta: "中小企業庁",
    icon: Search,
  },
  {
    title: "調達ポータル｜案件検索",
    description: "国の機関が公開する調達案件を名称・機関・地域などから検索。",
    href: "https://www.p-portal.go.jp/pps-web-biz/UAA01/OAA0101",
    meta: "デジタル庁",
    icon: Search,
  },
  {
    title: "防衛省｜公告・公示・公募",
    description: "防衛省・各調達機関の公告と調達情報への入口。",
    href: "https://www.mod.go.jp/j/budget/chotatsu/index.html",
    meta: "防衛省",
    icon: ShieldCheck,
  },
  {
    title: "陸上自衛隊｜調達情報",
    description: "方面隊・駐屯地・部隊ごとの入札、仕様書、契約情報。",
    href: "https://www.mod.go.jp/gsdf/procurement_information/",
    meta: "陸上自衛隊",
    icon: Landmark,
  },
  {
    title: "海上自衛隊｜調達情報",
    description: "基地・部隊ごとの入札公告、オープンカウンター等を確認。",
    href: "https://www.mod.go.jp/msdf/bukei/index.html",
    meta: "海上自衛隊",
    icon: Landmark,
  },
  {
    title: "航空自衛隊｜調達情報",
    description: "全国の基地・会計機関別に入札情報を確認。",
    href: "https://www.mod.go.jp/asdf/choutatsu/",
    meta: "航空自衛隊",
    icon: Landmark,
  },
];

export const keywordGroups = [
  {
    title: "AI・DX・人材育成",
    description: "SFLの研修・DX支援と親和性が高い中核キーワード",
    keywords: [
      "生成AI", "AI研修", "生成AI研修", "DX研修", "デジタル人材育成",
      "リスキリング", "DX推進", "業務改善", "生産性向上", "デジタル化支援",
    ],
  },
  {
    title: "システム・ツール導入",
    description: "Lark・ノーコード・業務アプリ構築につながるキーワード",
    keywords: [
      "業務システム", "情報共有システム", "グループウェア", "ビジネスチャット",
      "ワークフロー", "データベース構築", "ノーコード", "ローコード",
      "SaaS導入", "アプリ開発",
    ],
  },
  {
    title: "業務設計・伴走支援",
    description: "現状整理から導入・定着までの支援案件を探すキーワード",
    keywords: [
      "BPR", "業務整理", "DXコンサルティング", "導入支援", "運用支援",
      "運用保守", "マニュアル作成", "ヘルプデスク", "事務局運営", "伴走支援",
    ],
  },
  {
    title: "Webサイト系",
    description: "表記の違いを含め、Webサイト制作・再構築案件を広く拾うキーワード",
    keywords: [
      "ウェブサイト制作", "Webサイト制作", "ホームページ制作", "ホームページ再構築",
      "公式サイト再構築", "ウェブサイト再構築", "サイトリニューアル",
      "Webサイトリニューアル", "ポータルサイト構築", "情報発信サイト構築",
      "特設サイト構築", "広報サイト制作", "Webページ構築", "ウェブコンテンツ制作",
    ],
  },
  {
    title: "小規模案件を拾いやすい業務名",
    description: "比較的小規模なWeb構築・改修・運用案件を業務名から探すキーワード",
    keywords: [
      "Webサイト制作業務委託", "ホームページ運用保守業務", "CMS導入業務",
      "情報発信サイト構築業務", "講座情報検索システム構築業務",
      "イベント情報検索サイト構築業務", "施設情報検索システム構築業務",
      "データベース公開システム構築業務", "台帳管理システム構築業務",
      "ポータルサイト運用管理業務", "Webサイト再構築・運用保守業務",
      "Webシステム改修業務", "Webアプリケーション構築業務",
      "電子申請フォーム構築業務", "予約受付システム導入業務",
      "公共施設予約システム導入業務", "イベント申込管理システム構築業務",
    ],
  },
  {
    title: "広報・コンテンツ制作",
    description: "情報発信・広報物・クリエイティブ制作の案件を探すキーワード",
    keywords: [
      "LP制作", "広報支援", "SNS運用", "動画制作", "デザイン制作",
      "チラシ制作", "コンテンツ制作", "情報発信",
    ],
  },
  {
    title: "調査・事務・データ支援",
    description: "オンライン秘書やバックオフィス支援に近い案件用",
    keywords: [
      "調査業務", "データ入力", "データ集計", "アンケート調査", "アンケート集計",
      "資料作成", "事務支援", "事務補助", "問い合わせ対応", "運営支援",
    ],
  },
  {
    title: "公告方式・契約表現",
    description: "検索結果を広げるために組み合わせたい入札特有の表現",
    keywords: [
      "公募型プロポーザル", "企画競争", "提案募集", "業務委託", "役務",
      "研修業務", "実証事業", "委託事業", "公募", "見積合わせ",
    ],
  },
  {
    title: "物品・印刷・施設管理",
    description: "Academyで取り組む物品購入、印刷、清掃・管理などの案件用",
    keywords: [
      "物品", "事務用品", "消耗品", "備品", "印刷", "製本", "パンフレット",
      "清掃", "除草", "維持管理", "研修", "講習", "イベント", "運営",
    ],
  },
];

export const keywordSections = [
  {
    title: "優先して検索",
    description: "SFLの強みと直結し、最初に確認したい案件領域",
    groupIndexes: [0, 3, 4],
  },
  {
    title: "システム・運用支援",
    description: "構築だけでなく、導入・改善・事務支援まで含めて検索",
    groupIndexes: [1, 2, 6],
  },
  {
    title: "広報・入札表現",
    description: "制作案件と、公告で使われる契約表現を補助検索",
    groupIndexes: [5, 7],
  },
];

export const searchExamples = [
  "生成AI研修 業務委託",
  "Webサイト再構築 運用保守",
  "CMS導入業務",
  "予約受付システム 導入",
  "DX推進 プロポーザル",
];

export const signatureProfiles = {
  kotera: {
    name: "小寺 健太",
    tabLabel: "代表・業務執行社員",
    luciaTitle: "LUCIA代表署名",
    luciaBadge: "代表者",
    luciaDescription: "LUCIA代表・合同会社SFL業務執行社員の肩書きを併記した署名です。",
    luciaText: `────────────────────────
LUCIA
代表　小寺 健太
官公庁入札窓口

合同会社SFL
業務執行社員
AI・DX入札事業部

公式サイト
https://lucia-official.lucia20200524.chatgpt.site/
────────────────────────`,
    sflTitle: "合同会社SFL役職署名",
    sflBadge: "業務執行社員",
    sflDescription: "合同会社SFLの業務執行社員として連絡するときに使用します。",
    sflText: `────────────────────────
合同会社SFL
業務執行社員　小寺 健太
AI・DX入札事業部

本店所在地
兵庫県神戸市中央区磯辺通1-1-18
カサベラ国際プラザビル707

公式サイト
https://sfl-seo-strategy.lucia20200524.chatgpt.site/
────────────────────────`,
  },
  yamazaki: {
    name: "山﨑 ひかる",
    tabLabel: "担当",
    luciaTitle: "LUCIA担当者署名",
    luciaBadge: "担当",
    luciaDescription: "LUCIA名義の案件を担当者として連絡するときに使用します。",
    luciaText: `────────────────────────
LUCIA
官公庁入札窓口
担当　山﨑 ひかる

案件管理・提案支援：
合同会社SFL
AI・DX入札事業部

公式サイト
https://lucia-official.lucia20200524.chatgpt.site/
────────────────────────`,
    sflTitle: "合同会社SFL担当者署名",
    sflBadge: "担当",
    sflDescription: "合同会社SFL名義の案件を担当者として連絡するときに使用します。",
    sflText: `────────────────────────
合同会社SFL
AI・DX入札事業部
担当　山﨑 ひかる

本店所在地
兵庫県神戸市中央区磯辺通1-1-18
カサベラ国際プラザビル707

公式サイト
https://sfl-seo-strategy.lucia20200524.chatgpt.site/
────────────────────────`,
  },
} as const;

export const flow = [
  "案件を検索",
  "公告・仕様書を確認",
  "案件登録・参加判断",
  "提案・見積作成",
  "提出・締切管理",
  "実施・報告",
];
