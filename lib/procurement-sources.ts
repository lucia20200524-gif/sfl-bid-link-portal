export const procurementSources = [
  { id: "kkj", name: "官公需情報ポータル", href: "https://www.kkj.go.jp/s/", automatic: true, coverage: "国・自治体などの収録公告を横断検索します。" },
  { id: "p-portal", name: "調達ポータル", href: "https://www.p-portal.go.jp/pps-web-biz/UAA01/OAA0101", automatic: false, coverage: "自動検索・調査結果の取り込みは準備中です。公式サイトは引き続き開いて検索できます。" },
  { id: "mod", name: "防衛省", href: "https://www.mod.go.jp/j/budget/chotatsu/index.html", automatic: true, coverage: "官公需情報ポータルに収録された防衛省の案件と、防衛省内局の公式公告を取得します。" },
  { id: "gsdf", name: "陸上自衛隊", href: "https://www.mod.go.jp/gsdf/procurement_information/", automatic: false, coverage: "公式の「各部隊等調達情報」にある16部隊・機関を巡回し、読み取れた公告を一覧に反映します。未確認のページは取得状況に表示します。" },
  { id: "msdf", name: "海上自衛隊", href: "https://www.mod.go.jp/msdf/bukei/index.html", automatic: false, coverage: "公式の「公募及び企画競争公示」「公告」「常続的公示」から各部隊を巡回し、読み取れた公告を一覧に反映します。未確認のページは取得状況に表示します。" },
  { id: "asdf", name: "航空自衛隊", href: "https://www.mod.go.jp/asdf/choutatsu/", automatic: false, coverage: "公式の「基地等契約機関」にある28機関を巡回し、読み取れた公告を一覧に反映します。未確認のページは取得状況に表示します。" },
] as const;

export type ProcurementSourceId = typeof procurementSources[number]["id"];
export function isProcurementSourceId(value: unknown): value is ProcurementSourceId {
  return typeof value === "string" && procurementSources.some(source => source.id === value);
}
export function procurementSource(id: ProcurementSourceId) {
  return procurementSources.find(source => source.id === id)!;
}
export const defenseSourceTerms: Partial<Record<ProcurementSourceId, string[]>> = {
  gsdf: ["陸上自衛隊", "陸自"], msdf: ["海上自衛隊", "海自"], asdf: ["航空自衛隊", "空自"],
};

export function matchesProcurementSource(id: ProcurementSourceId, item: { agency: string; title?: string; officialUrl: string }) {
  if (id === "p-portal") {
    try {
      const host = new URL(item.officialUrl).hostname;
      return host === "p-portal.go.jp" || host.endsWith(".p-portal.go.jp");
    } catch { return false; }
  }
  if (id === "mod" || defenseSourceTerms[id]) {
    let officialDefenseSite = false, officialBranchSite = false;
    try {
      const url = new URL(item.officialUrl);
      officialDefenseSite = url.hostname === "mod.go.jp" || url.hostname.endsWith(".mod.go.jp");
      officialBranchSite = officialDefenseSite && url.pathname.startsWith(`/${id}/`);
    } catch { return false; }
    if (id === "mod") return item.agency.includes("防衛省") || officialDefenseSite;
    // A branch mentioned in an unrelated notice's body is not its issuing source.
    return officialBranchSite || ((item.agency.includes("防衛省") || officialDefenseSite) && defenseSourceTerms[id]!.some(term => `${item.agency} ${item.title ?? ""}`.includes(term)));
  }
  return true;
}
