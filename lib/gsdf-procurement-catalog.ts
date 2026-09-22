// Official URLs inspected on 2026-09-16. These are navigation seeds, not
// assertions that a collection run succeeded. Runtime status is kept separately.
export const gsdfCatalogRevision = "2026-09-16-selected16";
const official = (path: string) => `https://www.mod.go.jp/gsdf/${path}`;
const entries = [
  ["北部方面隊", "nae/fin/", ["nae/fin/nafin/R8kokoku.html", "nae/fin/nafin/R8open.html"]],
  ["東北方面隊", "neae/neahq/koukoku/finindex.htm", ["neae/koukoku/fin/r08_nendo/gaiyou_08-6.html", "neae/koukoku/dep/index.htm"]],
  ["東部方面隊", "eae/kaikei/eafin/index.html", ["eae/kaikei/eafin/koubo.html"]],
  ["中部方面隊", "mae/mafin/", []],
  ["西部方面隊", "wae/info/nyusatu/", ["wae/info/nyusatu/wa-fin/kou/R8ippan.htm"]],
  ["中央会計隊", "dc/cfin/html/", ["dc/cfin/html/fee.html"]],
  ["中央輸送隊", "yokohama/", ["yokohama/hp2015/06bosyu/nyusatu/p10nyusatsu.html"]],
  ["教育訓練研究本部", "tercom/procurement.html", ["tercom/proc1.html", "tercom/proc3.html"]],
  ["高射学校", "aasch/aaspr-hp/sta-intro/draft/draft.html", ["aasch/aaspr-hp/sta-intro/draft/draft1.html"]],
  ["航空学校", "akeno/", ["akeno/html/fin/fin.html"]],
  ["航空学校宇都宮校", "kitautunomiya/kaikei.htm", []],
  ["システム通信・サイバー学校", "sigsch/fin/index.html", []],
  ["後方支援学校武器科部", "ord_sch/07_fin/main.html", ["eae/kaikei/eafin/koubo.html"]],
  ["小平学校", "kodaira/KSintro.html", ["kodaira/keiyaku/koukoku.html"]],
  ["補給本部", "gmcc/", ["gmcc/raising/index.html", "gmcc/raising/hoto/hnyu/hnyu_list.html", "gmcc/raising/hoto/hoc/hoc_list.html", "gmcc/raising/gyoumu/gnyu/gnyu_list.html", "gmcc/raising/gyoumu/goc/goc_list.html"]],
  ["自衛隊中央病院", "chosp/fin/index.html", ["chosp/fin/contents1.html"]],
] as const;
export const gsdfProcurementCatalog = entries.map(([name, entry, listings]) => ({
  name, entryUrl: official(entry), listingUrls: listings.map(official),
}));
