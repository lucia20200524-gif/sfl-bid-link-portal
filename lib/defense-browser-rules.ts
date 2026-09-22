import { gsdfProcurementCatalog } from "./gsdf-procurement-catalog";
// User-selected official sections, 2026-09-11. These are browser navigation
// rules, not an assertion that a crawler is connected or has visited a target.
import { msdfProcurementCatalog } from "./msdf-procurement-catalog";
import { asdfProcurementCatalog } from "./asdf-procurement-catalog";
export type DefenseSourceId = "gsdf" | "msdf" | "asdf";
export const defenseBrowserRules = {
  gsdf: {
    title: "陸上自衛隊各部隊等調達情報",
    entryUrl: "https://www.mod.go.jp/gsdf/procurement_information/",
    targetUnit: "部隊・機関",
    targets: gsdfProcurementCatalog.map(entry=>entry.name),
    navigation: "指定の16部隊・機関のリンクを開き、その先の駐屯地・会計隊を含めて、入札公告・オープンカウンター・公募の掲載欄を確認します。",
  },
  msdf: {
    title: "海上自衛隊調達情報",
    entryUrl: "https://www.mod.go.jp/msdf/bukei/nyusatsu_idx.html",
    targetUnit: "基地・契約機関",
    targets: msdfProcurementCatalog.map(entry=>entry.name),
    navigation: "「公告」一覧の33基地・契約機関から、一般競争入札・オープンカウンターの掲載欄と添付PDFを確認します。第１術科学校の統合先（呉）、下総・航空補給処の移動先、佐世保掲載の対馬・奄美の資料も対象です。取得できない資料は未確認と表示します。",
  },
  asdf: {
    title: "航空自衛隊基地等契約機関（28機関）",
    entryUrl: "https://www.mod.go.jp/asdf/choutatsu/",
    targetUnit: "機関",
    targets: asdfProcurementCatalog.map(entry=>entry.name),
    navigation: "指定の28機関のリンクを開き、各基地の入札公告・公示・オープンカウンター欄と、個別公告・添付PDFを確認します。",
  },
} as const;

export function isDefenseBrowserSource(value: string): value is DefenseSourceId {
  return Object.prototype.hasOwnProperty.call(defenseBrowserRules, value);
}

export const defenseBrowserPolicy = {
  method: "official-browser",
  appliesTo: ["sfl", "engineer", "academy", "free"],
  keywordMatch: "any",
  deadlinePolicy: "confirmed-future-only",
  timezone: "Asia/Tokyo",
  followIndividualNotices: true,
  inspectAttachments: true,
  requireEveryTargetStatus: true,
  fallbackToKkj: false,
  // Runtime availability is checked server-side; policy is not a connection flag.
} as const;

export const defenseBrowserUnavailable = "自衛隊のブラウザー検索は接続設定が未完了です。指定先の確認はまだ実行していません。案件が0件という意味ではありません。";
