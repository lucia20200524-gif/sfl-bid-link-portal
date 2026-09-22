export const engineerWebKeywords = [
  "ウェブサイト制作", "Webサイト制作", "ホームページ制作", "ホームページ再構築",
  "公式サイト再構築", "ウェブサイト再構築", "サイトリニューアル", "Webサイトリニューアル",
  "ポータルサイト構築", "情報発信サイト構築", "特設サイト構築", "広報サイト制作",
  "Webページ構築", "ウェブコンテンツ制作",
];

export const engineerSmallProjectKeywords = [
  "Webサイト制作業務委託", "ホームページ運用保守業務", "CMS導入業務", "情報発信サイト構築業務",
  "講座情報検索システム構築業務", "イベント情報検索サイト構築業務", "施設情報検索システム構築業務",
  "データベース公開システム構築業務", "台帳管理システム構築業務", "ポータルサイト運用管理業務",
  "Webサイト再構築・運用保守業務", "Webシステム改修業務", "Webアプリケーション構築業務",
  "電子申請フォーム構築業務", "予約受付システム導入業務", "公共施設予約システム導入業務",
  "イベント申込管理システム構築業務",
];

export const engineerMatchingKeywords = ["マッチングシステム", "会員管理", "応募管理", "申請受付システム", "予約管理", "業務システム構築", "Webシステム構築", "システム改修"];
export const engineerKeywords = [...engineerMatchingKeywords, ...engineerWebKeywords, ...engineerSmallProjectKeywords];

export const collectionModes = [
  {
    id: "sfl", label: "SFL専用",
    description: "AI・DX研修、Web制作、業務改善など、SFLの事業に合う候補を探します。",
    defaultKeyword: "生成AI研修、DX研修、リスキリング、業務改善、Webサイト制作",
    placeholder: "例：研修、業務改善、ホームページ",
    presets: [
      { label: "AI・DX研修", value: "生成AI、AI研修、DX研修、リスキリング" },
      { label: "Web制作", value: "ホームページ、ウェブサイト、Webサイト、CMS" },
      { label: "業務改善", value: "業務改善、BPR、グループウェア、業務システム" },
      { label: "広報・制作", value: "広報、動画、デザイン、SNS" },
    ],
  },
  {
    id: "engineer", label: "SFL(エンジニア専用)",
    description: "国・自治体のWeb制作、マッチング・会員管理・申請受付などの開発候補を探します。参加条件は別途確認します。",
    defaultKeyword: engineerKeywords.join("、"),
    placeholder: "例：ウェブサイト制作、講座情報検索システム構築業務",
    presets: [
      { label: `全${engineerKeywords.length}語`, value: engineerKeywords.join("、") },
      { label: "マッチング・業務システム", value: engineerMatchingKeywords.join("、") },
      { label: `Webサイト系（${engineerWebKeywords.length}語）`, value: engineerWebKeywords.join("、") },
      { label: `小規模案件の業務名（${engineerSmallProjectKeywords.length}語）`, value: engineerSmallProjectKeywords.join("、") },
    ],
  },
  {
    id: "academy", label: "一般用(Academy専用)",
    description: "自分の業種や対応できる仕事に合わせて、キーワードを選んで探します。",
    defaultKeyword: "物品、事務用品、印刷、清掃", placeholder: "例：事務用品、印刷、清掃",
    presets: [
      { label: "物品購入", value: "物品、事務用品、消耗品、備品" },
      { label: "印刷・制作", value: "印刷、製本、パンフレット、デザイン" },
      { label: "清掃・管理", value: "清掃、除草、維持管理" },
      { label: "研修・運営", value: "研修、講習、イベント、運営" },
    ],
  },
] as const;

export type PresetMode = typeof collectionModes[number]["id"];
export const searchModes = [...collectionModes, {
  id: "free", label: "フリーモード",
  description: "自由なキーワードで案件を探します。参加資格・等級は共通の固定条件を適用します。",
  defaultKeyword: "", placeholder: "探したい仕事や物品名を入力", presets: [],
}] as const;
export type CollectionMode = typeof searchModes[number]["id"];
export type LarkMode = CollectionMode;
export function defaultLarkMode(mode: CollectionMode): LarkMode { return mode; }

// User-supplied examples, kept separate from live collection results.
export const engineerReferences = [
  { agency: "青森県", title: "公共施設予約システム導入業務", href: "https://www.pref.aomori.lg.jp/soshiki/seisaku/dxsuishin/r8_koubo_publicfacilityreservationsystem.html" },
  { agency: "和歌山県", title: "「きのくに県民カレッジ」・「出張まなび講座」ウェブサイト制作及び講座検索システム構築業務", href: "https://www.pref.wakayama.lg.jp/prefg/500600/kikaku/d00222620.html" },
  { agency: "白河市", title: "福祉まるごと傾聴AI事業業務委託", href: "https://www.city.shirakawa.fukushima.jp/page/page010913.html" },
];
