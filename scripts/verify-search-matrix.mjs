// Explicit, sequential live QA. Does not register bids or write to Lark.
// Run: node scripts/verify-search-matrix.mjs /absolute/path/to/report-directory
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const output = process.argv[2];
if (!output?.startsWith("/")) throw new Error("Supply an absolute report directory");
const root = fileURLToPath(new URL("..",import.meta.url));
const vite = await createServer({configFile:false,appType:"custom",root,resolve:{alias:{"@":root}},server:{middlewareMode:true,hmr:false,watch:null}});
const originalFetch = globalThis.fetch;
const rows=[];
await mkdir(output,{recursive:true});
try {
  const {collectionModes}=await vite.ssrLoadModule("/lib/collection-profiles.ts");
  const {procurementSources}=await vite.ssrLoadModule("/lib/procurement-sources.ts");
  const {isDefenseBrowserSource}=await vite.ssrLoadModule("/lib/defense-browser-rules.ts");
  const {searchProcurements}=await vite.ssrLoadModule("/lib/procurement-search.ts");
  const {isFutureBidDeadline}=await vite.ssrLoadModule("/lib/procurement-deadline.ts");
  const {default:Results}=await vite.ssrLoadModule("/app/collection-table.tsx");
  const {default:SearchForm}=await vite.ssrLoadModule("/app/collection-search-form.tsx");
  const callbacks={onChange(){},onGenerate(){},onSubmit(){},onKeywords(){},onCopyKeywords(){}};
  for (const mode of collectionModes) for(const source of procurementSources) {
    const row={mode:mode.id,modeLabel:mode.label,sourceId:source.id,sourceLabel:source.name,keywords:mode.defaultKeyword,scope:"fulltext",startedAt:new Date().toISOString(),requests:[]};
    console.log(`START ${mode.id}/${source.id}`);
    const started=Date.now();
    let result={items:[],sources:[]},error="";
    globalThis.fetch=async(input,init)=>{
      const url=new URL(input);
      assert.equal(url.origin,"https://www.kkj.go.jp","QA must only read the official public search service");
      const request={count:Number(url.searchParams.get("Count")),url:url.href};
      row.requests.push(request);
      const response=await originalFetch(input,init);
      request.status=response.status;
      request.contentLength=response.headers.get("content-length");
      return response;
    };
    try {
      const fields={keyword:mode.defaultKeyword,keywordGroup:"recommended",sourceId:source.id,scope:"fulltext"};
      const form=renderToStaticMarkup(React.createElement(SearchForm,{mode,fields,loading:false,anyCollecting:false,error:"",...callbacks}));
      const radios=form.match(/<button\b[^>]*role="radio"[^>]*>/g)||[];
      assert.equal(radios.length,procurementSources.length);
      assert.equal(radios.filter(tag=>tag.includes('aria-checked="true"')).length,1);
      assert.ok(radios.find(tag=>tag.includes(`value="${source.id}"`))?.includes('aria-checked="true"'));
      if(isDefenseBrowserSource(source.id)) {
        assert.match(form,/data-search-method="official-browser"/);
        assert.match(form,/自動検索は未接続/);
        assert.doesNotMatch(form,/<button[^>]*type="submit"/);
        row.outcome="browser-not-connected";
      } else if(source.automatic) {
        assert.match(form,/<button[^>]*type="submit"/);
        try {
          result=await searchProcurements(mode.defaultKeyword.split("、"),{scope:"fulltext",sourceId:source.id});
          row.outcome=result.items.length?"rows":"empty";
          assert.ok(result.items.every(item=>isFutureBidDeadline(item.deadline,result.search.searchedOn)));
          assert.ok(result.items.every(item=>item.searchSourceId===source.id));
          assert.ok(result.items.length<=result.limit);
        } catch(e) {
          error=e.message;row.outcome="search-error";row.error=error;row.status=e.status||null;
        }
      } else {
        assert.ok(form.includes(`href="${source.href}"`));
        assert.ok(form.includes(`${source.name}を開いて検索`));
        assert.doesNotMatch(form,/<button[^>]*type="submit"/);
        row.outcome="external-only";
      }
      const html=renderToStaticMarkup(React.createElement(Results,{result,sourceId:source.id,mode:mode.id,contextLabel:mode.label,loading:false,error,onRegister(){}}));
      const displayed=(html.match(/class="collection-item-title collection-official-link"/g)||[]).length;
      assert.equal(displayed,result.items.length,"every returned candidate must render a visible result link");
      if(row.outcome==="browser-not-connected") {
        assert.match(html,/ブラウザー検索：まだ結果を取得していません/);
        assert.match(html,/案件が0件という意味ではありません/);
        assert.doesNotMatch(html,/0件表示/);
        assert.equal(row.requests.length,0);
      } else if(row.outcome==="search-error") {
        assert.match(html,/検索未完了/);
        assert.match(html,/案件が0件という意味ではありません/);
        assert.doesNotMatch(html,/0件表示/);
      } else if(row.outcome==="empty") {
        assert.match(html,/未来の入札締切日を確認できる案件はありませんでした/);
      } else if(row.outcome==="external-only") {
        assert.match(html,/自動取得には対応していません/);
        assert.equal(row.requests.length,0);
      }
      Object.assign(row,{formPassed:true,renderPassed:true,displayed,upstreamHits:result.upstreamHits,inspectedCount:result.inspectedCount,matchedCount:result.matchedCount,deadlineStats:result.deadlineStats,recommendation:!!result.recommendation,message:result.message,partial:result.sources.some(source=>source.status==="partial"),items:result.items});
      await writeFile(resolve(output,`${mode.id}-${source.id}.html`),html);
      await writeFile(resolve(output,`${mode.id}-${source.id}.json`),JSON.stringify(result,null,2));
    } catch(e) {
      row.outcome="qa-failure";row.error=e.message;row.renderPassed=false;
    }
    row.elapsedMs=Date.now()-started;
    rows.push(row);
    await writeFile(resolve(output,"matrix.json"),JSON.stringify({testedAt:new Date().toISOString(),scope:"Live official API + production component rendering. Browser authentication and Lark writes not tested.",rows},null,2));
    console.log(JSON.stringify({mode:row.mode,sourceId:row.sourceId,outcome:row.outcome,displayed:row.displayed,upstreamHits:row.upstreamHits,inspectedCount:row.inspectedCount,deadlineStats:row.deadlineStats,recommendation:row.recommendation,renderPassed:row.renderPassed,error:row.error,elapsedMs:row.elapsedMs,requests:row.requests.map(({count,status})=>({count,status}))}));
  }
  assert.equal(rows.length,collectionModes.length*procurementSources.length);
  console.log(JSON.stringify({complete:true,patterns:rows.length,withRows:rows.filter(r=>r.outcome==="rows").length,empty:rows.filter(r=>r.outcome==="empty").length,errors:rows.filter(r=>r.outcome==="search-error").length,external:rows.filter(r=>r.outcome==="external-only").length,browserPending:rows.filter(r=>r.outcome==="browser-not-connected").length,qaFailures:rows.filter(r=>r.outcome==="qa-failure").length}));
  if(rows.some(row=>["qa-failure","search-error","browser-not-connected"].includes(row.outcome)))process.exitCode=1;
} finally {globalThis.fetch=originalFetch;await vite.close();}
