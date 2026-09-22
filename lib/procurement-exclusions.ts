// User-selected exclusions, 2026-09-16. Fuji is paused; the other three
// GSDF schools are outside the search scope. Keep historical records intact.
export const excludedGsdfTargets = ["富士学校", "幹部候補生学校", "施設学校", "衛生学校"] as const;
export function isExcludedGsdfUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === "www.mod.go.jp" && /^\/gsdf\/(?:fsh|ocsh|shisetsu|mss)(?:\/|$)/i.test(url.pathname);
  } catch { return false; }
}
export function isProcurementGuide(title:string) {
  const label=title.normalize("NFKC").replace(/\s+/g, "").replace(/(?:[（(]?PDF[^）)]*[）)]?)$/i, "");
  return /^(?:オープン[・･]?カウンター?(?:方式)?(?:とは|について|のご案内|の説明|実施要領)|(?:入札|契約)(?:参加)?(?:の手引き|の心得|書式一覧|様式一覧))$/.test(label);
}
export function isExcludedProcurement(item: {title?:string;agency?:string;source?:string;officialUrl?:string;sourceUrl?:string}) {
  if(isProcurementGuide(item.title??""))return true;
  const urls = [item.officialUrl, item.sourceUrl].filter((url):url is string=>!!url);
  if (urls.some(isExcludedGsdfUrl)) return true;
  const names = `${item.agency ?? ""} ${item.source ?? ""}`.normalize("NFKC").replace(/\s/g, "");
  const gsdf = /陸上自衛隊|陸自/.test(names) || urls.some(url=>/^https:\/\/www\.mod\.go\.jp\/gsdf\//i.test(url));
  return gsdf && excludedGsdfTargets.some(name=>names.includes(name));
}
