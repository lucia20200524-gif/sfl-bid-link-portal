// Explicit live check; this is not part of the default test suite.
// Run with node --use-env-proxy when the local runtime requires its configured proxy.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..",import.meta.url));
const vite = await createServer({configFile:false,appType:"custom",root,resolve:{alias:{"@":root}},server:{middlewareMode:true,hmr:false}});
try {
  const { collectionModes } = await vite.ssrLoadModule("/lib/collection-profiles.ts");
  const { searchProcurements } = await vite.ssrLoadModule("/lib/procurement-search.ts");
  const { resultCategories, matchesResultCategory } = await vite.ssrLoadModule("/lib/procurement-classification.ts");
  for (const mode of collectionModes) {
    const started = Date.now();
    const keywords = mode.defaultKeyword.split("、");
    const result = await searchProcurements(keywords,{days:90,scope:"fulltext"});
    assert.ok(result.items.length > 0, `${mode.label}: live search returned no displayable items`);
    assert.ok(result.totalHits >= result.items.length);
    assert.ok(result.items.every(item=>item.title && item.officialUrl.startsWith("http") && item.deadline===""));
    console.log(JSON.stringify({tab:mode.label,categories:Object.fromEntries(resultCategories.map(category=>[category.label,result.items.filter(item=>matchesResultCategory(item,category.id)).length])),classificationSamples:result.items.filter(item=>item.classification?.openCounterEvidence||item.classification?.unifiedRequiredEvidence).slice(0,2).map(item=>({title:item.title,url:item.officialUrl,...item.classification}))}));
    console.log(JSON.stringify({tab:mode.label,keywords:keywords.length,totalHits:result.totalHits,displayed:result.items.length,received:result.returnedCount,skipped:result.skippedCount,seconds:Math.round((Date.now()-started)/1000),at:result.collectedAt,search:result.search,samples:result.items.filter(item=>item.matchLocation==="title").concat(result.items).slice(0,3).map(item=>({title:item.title,agency:item.agency,url:item.officialUrl,match:item.matchLocation}))}));
  }
} finally { await vite.close(); }
