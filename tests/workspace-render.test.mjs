import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ configFile: false, appType: "custom", root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => { await vite.close(); });

test("reorganized form retains candidate values, optional notes and required submission date", async () => {
  const { default: Form } = await vite.ssrLoadModule("/app/bid-editor-form.tsx");
  const { emptyBid } = await vite.ssrLoadModule("/lib/bid-domain.ts");
  const html = renderToStaticMarkup(React.createElement(Form, {
    draft: { ...emptyBid, title:"候補テスト", agency:"発注機関テスト", summary:"業務概要テスト", qualifications:"資格条件テスト", concerns:"要確認テスト", notes:"次の作業テスト", status:"submitted", submittedOn:"2026-09-10", officialUrl:"https://example.test/notice.pdf" },
    members:[], saving:false, error:"", onChange(){}, onSave(){}, onClose(){},
  }));
  for (const value of ["候補テスト","発注機関テスト","業務概要テスト","資格条件テスト","要確認テスト","次の作業テスト"]) assert.ok(html.includes(value));
  assert.equal((html.match(/<fieldset/g)||[]).length,6);
  for (const label of ["作業・必要書類・先行手続き","結果と振り返り","質問・提案の準備"]) assert.ok(html.includes(label));
  assert.match(html, /href="https:\/\/example.test\/notice.pdf"/);
  assert.match(html, /<input[^>]*required[^>]*value="2026-09-10"/);
});
test("workflow editing retains incomplete text while awaiting save validation",async()=>{
  const { default: Editor }=await vite.ssrLoadModule("/app/bid-workflow-editor.tsx");
  const { emptyBid }=await vite.ssrLoadModule("/lib/bid-domain.ts");
  const { emptyWorkflow }=await vite.ssrLoadModule("/lib/procurement-workbench.ts");
  const workflow=emptyWorkflow();
  workflow.tasks=[{id:"task-1",title:"",kind:"question",date:"2099-10-05",time:"15:00",owner:"編集中の担当者",evidence:"維持する根拠",done:false}];
  workflow.result={...workflow.result,winner:"維持する落札企業",sourceUrl:"https:",amount:"1,000"};
  const html=renderToStaticMarkup(React.createElement(Editor,{draft:{...emptyBid,workflow:JSON.stringify(workflow)},onChange(){}}));
  for(const value of ["編集中の担当者","維持する根拠","維持する落札企業","https:","1,000"]) assert.ok(html.includes(value));
});
test("result table displays real candidates, escapes page content and shows only future deadlines", async () => {
  const { default: Results } = await vite.ssrLoadModule("/app/collection-table.tsx");
  const html = renderToStaticMarkup(React.createElement(Results, { result:{items:[{id:"1",title:"<script>調査候補</script>",agency:"掲載元",source:"掲載元",deadline:"2099-10-05",officialUrl:"https://example.test/notice",sourceUrl:"https://example.test",matchedKeywords:["研修"],summary:"業務概要。全省庁統一資格を有する者。"}],sources:[]}, loading:false,error:"",onRegister(){} }));
  assert.ok(html.includes("&lt;script&gt;調査候補&lt;/script&gt;"));
  assert.ok(html.includes("要確認"));
  assert.ok(html.includes("案件に登録"));
  assert.ok(html.includes('href="https://example.test/notice"'));
});

test("failed searches are never rendered as a successful zero", async () => {
  const { default: Results } = await vite.ssrLoadModule("/app/collection-table.tsx");
  const html=renderToStaticMarkup(React.createElement(Results,{result:{items:[],sources:[]},loading:false,error:"接続できませんでした",onRegister(){}}));
  assert.ok(html.includes("検索未完了"));
  assert.ok(html.includes("案件が0件という意味ではありません"));
  assert.ok(!html.includes("0件表示"));
  assert.ok(!html.includes("一致する案件は見つかりませんでした"));
});

test("recommendations disclose their limited scope and match basis across all three audience tables",async()=>{
  const { default: Results }=await vite.ssrLoadModule("/app/collection-table.tsx");
  const { collectionModes }=await vite.ssrLoadModule("/lib/collection-profiles.ts");
  const result={items:[{id:"recommended",title:"研修案件",agency:"発注元",source:"発注元",deadline:"2099-10-05",officialUrl:"https://example.test/notice",matchedKeywords:["研修"],matchLocation:"title",summary:"全省庁統一資格を有する者。"}],sources:[{title:"官公需情報ポータル",status:"partial",count:1}],recommendation:{reason:"response-too-large",limit:20,basis:"件名での一致を優先し、一致キーワード数が多い順に表示します。同じ条件では締切が近い順です。"}};
  for(const mode of collectionModes){
    const html=renderToStaticMarkup(React.createElement(Results,{result,mode:mode.id,contextLabel:mode.label,loading:false,error:"",onRegister(){}}));
    assert.match(html,/おすすめを表示（最大20件）/);
    assert.match(html,/取得できた案件の中から/);
    assert.match(html,/一致キーワード数が多い順/);
    assert.match(html,/件名に一致 · 一致キーワード 1語/);
    assert.match(html,/取得範囲内：1件表示/);
    assert.match(html,/Larkへ登録/);
    const normal=renderToStaticMarkup(React.createElement(Results,{result:{...result,recommendation:undefined},mode:mode.id,loading:false,error:"",onRegister(){}}));
    assert.doesNotMatch(normal,/おすすめを表示/);
  }
});

test("every audience and category excludes stale and unverified dates from rows and counts",async()=>{
  const { default: Results } = await vite.ssrLoadModule("/app/collection-table.tsx");
  const { collectionModes } = await vite.ssrLoadModule("/lib/collection-profiles.ts");
  const base={agency:"発注元",source:"発注元",officialUrl:"https://example.test/notice",matchedKeywords:[],summary:"",classification:{openCounterEvidence:"オープンカウンター方式による見積依頼",unifiedRequiredEvidence:"全省庁統一資格を有する者"}};
  const items=[
    {...base,id:"future",title:"未来の案件",deadline:"2026-09-13",deadlineEvidence:"入札書提出期限：2026年9月13日"},
    {...base,id:"today",title:"表示しない当日案件",deadline:"2026-09-12"},
    {...base,id:"past",title:"表示しない過去案件",deadline:"2026-09-11"},
    {...base,id:"unknown",title:"表示しない不明案件",deadline:""},
  ];
  for(const mode of collectionModes)for(const category of ["all","open-counter","unified-required"]){
    const html=renderToStaticMarkup(React.createElement(Results,{result:{items,sources:[],collectedAt:"2026-09-11T15:01:00Z",search:{scope:"fulltext",sourceId:"kkj",keywords:["研修"],searchedOn:"2026-09-12",deadlineFrom:"2026-09-13",deadlinePolicy:"future-only"}},category,contextLabel:mode.label,loading:false,error:"",onRegister(){},onCategoryChange(){}}));
    assert.match(html,/未来の案件/);
    assert.match(html,/入札締切 2026\/09\/13以降/);
    assert.match(html,/締切の記載/);
    assert.match(html,/1件表示 \/ 1件取得/);
    assert.doesNotMatch(html,/表示しない/);
  }
});

test("each audience shows category controls and only the selected category's rows", async () => {
  const { default: Results } = await vite.ssrLoadModule("/app/collection-table.tsx");
  const { collectionModes } = await vite.ssrLoadModule("/lib/collection-profiles.ts");
  const base={agency:"発注元",source:"発注元",deadline:"2026-10-05",officialUrl:"https://example.test/notice",matchedKeywords:[],summary:""};
  const items=[
    {...base,id:"open",title:"見積募集の案件",classification:{openCounterEvidence:"オープンカウンター方式による見積依頼"}},
    {...base,id:"required",title:"競争参加の案件",classification:{unifiedRequiredEvidence:"全省庁統一資格を有する者"}},
    {...base,id:"both",title:"両方の条件の案件",classification:{openCounterEvidence:"オープンカウンター方式による見積依頼",unifiedRequiredEvidence:"全省庁統一資格を有する者"}},
    {...base,id:"unknown",title:"未判定の案件"},
  ];
  for (const mode of collectionModes) for (const category of ["all","open-counter","unified-required"]) {
    const html=renderToStaticMarkup(React.createElement(Results,{result:{items,sources:[],collectedAt:"2026-09-11T00:00:00Z"},category,contextLabel:mode.label,loading:false,error:"",onRegister(){},onCategoryChange(){}}));
    assert.equal((html.match(/role="tab"/g)||[]).length,4);
    assert.ok(html.includes(mode.label));
    assert.ok(html.includes("オープンカウンター"));
    assert.ok(html.includes("全省庁統一資格必須"));
    assert.ok(html.includes("両方の条件の案件"));
    assert.equal(html.includes("未判定の案件"),false);
    assert.equal(html.includes("見積募集の案件"),category!=="unified-required");
    assert.equal(html.includes("競争参加の案件"),category!=="open-counter");
    assert.ok(html.includes("分類の根拠を見る"));
  }
});

test("keyword generation uses the shared collection and the same six-source form for every audience", async () => {
  const { default: SearchForm }=await vite.ssrLoadModule("/app/collection-search-form.tsx");
  const { generateSearchKeywords }=await vite.ssrLoadModule("/lib/keyword-generation.ts");
  const { collectionModes,engineerKeywords }=await vite.ssrLoadModule("/lib/collection-profiles.ts");
  const { keywordGroups,searchLinks }=await vite.ssrLoadModule("/lib/portal-content.ts");
  const { procurementSources }=await vite.ssrLoadModule("/lib/procurement-sources.ts");
  const dictionary=new Set(keywordGroups.flatMap(group=>group.keywords));
  assert.deepEqual(procurementSources.map(source=>source.href),searchLinks.map(link=>link.href));
  assert.equal(procurementSources.length,6);
  assert.ok(procurementSources.every(source=>source.id!=="njss"));
  assert.deepEqual(generateSearchKeywords("engineer").value.split("、"),engineerKeywords);
  const callbacks={onChange(){},onGenerate(){},onSubmit(){},onKeywords(){},onCopyKeywords(){}};
  for(const mode of collectionModes){
    const generated=generateSearchKeywords(mode.id);
    assert.ok(generated.count>0&&generated.count<=50);
    assert.ok(generated.value.length<=1000);
    assert.ok(generated.value.split("、").every(keyword=>dictionary.has(keyword)));
    const fields={keyword:generated.value,keywordGroup:"recommended",sourceId:"kkj",scope:"fulltext"};
    const html=renderToStaticMarkup(React.createElement(SearchForm,{mode,fields,loading:false,anyCollecting:false,error:"",...callbacks}));
    assert.equal((html.match(/role="radio"/g)||[]).length,6);
    assert.doesNotMatch(html,/NJSS|njss\.info/);
    assert.match(html,/キーワード集から自動生成/);
    assert.match(html,/<textarea/);
    assert.match(html,/入札締切日：検索日の翌日以降/);
    assert.match(html,/当日締切・期限切れ・締切不明/);
    assert.doesNotMatch(html,/公告・取得日の期間|過去30日/);
    assert.match(html,/<button[^>]*type="submit"/);
    const external=renderToStaticMarkup(React.createElement(SearchForm,{mode,fields:{...fields,sourceId:"p-portal"},loading:false,anyCollecting:false,error:"",...callbacks}));
    assert.match(external,/調達ポータルを開いて検索/);
    assert.match(external,/検索語をコピー/);
    assert.match(external,/準備中/);
    assert.doesNotMatch(external,/<button[^>]*type="submit"/);
  }
  for(const group of keywordGroups) assert.deepEqual(generateSearchKeywords("sfl",group.title).value.split("、"),[...new Set(group.keywords)]);
});

test("partial source coverage and external-only sources are never displayed as a successful global zero",async()=>{
  const { default: Results }=await vite.ssrLoadModule("/app/collection-table.tsx");
  const html=renderToStaticMarkup(React.createElement(Results,{result:{items:[],sources:[{title:"調達ポータル",status:"partial",count:0}],collectedAt:"2026-09-11T00:00:00Z",scopeNotice:"取得上限があります"},sourceId:"mod",loading:false,error:"",onRegister(){}}));
  assert.match(html,/検索先全体が0件という意味ではありません/);
  assert.match(html,/取得範囲内/);
  assert.match(html,/取得上限があります/);
  const external=renderToStaticMarkup(React.createElement(Results,{result:{items:[],sources:[]},sourceId:"p-portal",loading:false,error:"",onRegister(){}}));
  assert.match(external,/準備中/);
  assert.match(external,/案件が0件という意味ではありません/);
});

test("all nine defense audience/source forms show the requested browser rules and truthful pending results",async()=>{
  const { default: SearchForm }=await vite.ssrLoadModule("/app/collection-search-form.tsx");
  const { default: Results }=await vite.ssrLoadModule("/app/collection-table.tsx");
  const { collectionModes }=await vite.ssrLoadModule("/lib/collection-profiles.ts");
  const { defenseBrowserRules,isDefenseBrowserSource,defenseBrowserPolicy }=await vite.ssrLoadModule("/lib/defense-browser-rules.ts");
  assert.deepEqual(Object.values(defenseBrowserRules).map(r=>r.targets.length),[16,33,28]);
  assert.equal(isDefenseBrowserSource("constructor"),false);
  assert.equal(defenseBrowserPolicy.fallbackToKkj,false);
  assert.equal(defenseBrowserPolicy.deadlinePolicy,"confirmed-future-only");
  const callbacks={onChange(){},onGenerate(){},onSubmit(){},onKeywords(){},onCopyKeywords(){}};
  for(const mode of collectionModes)for(const sourceId of ["gsdf","msdf","asdf"]){
    const html=renderToStaticMarkup(React.createElement(SearchForm,{mode,fields:{keyword:mode.defaultKeyword,keywordGroup:"recommended",sourceId,scope:"fulltext"},loading:false,anyCollecting:false,error:"",...callbacks}));
    const rule=defenseBrowserRules[sourceId];
    assert.match(html,/接続設定を確認中/);
    assert.match(html,/data-search-method="official-browser"/);
    assert.match(html,/キーワード集から自動生成/);
    assert.match(html,/入札締切日：検索日の翌日以降/);
    assert.match(html,/個別公告・添付資料/);
    assert.equal((html.match(/role="radio"/g)||[]).length,6);
    assert.ok(html.includes(`href="${rule.entryUrl}"`));
    for(const target of rule.targets)assert.ok(html.includes(`<li>${target}</li>`));
    assert.doesNotMatch(html,/<button[^>]*type="submit"|調達ポータルを開いて検索/);
    const table=renderToStaticMarkup(React.createElement(Results,{mode:mode.id,contextLabel:mode.label,sourceId,result:{items:[],sources:[]},loading:false,error:"",onRegister(){}}));
    assert.match(table,/ブラウザー検索：まだ結果を取得していません/);
    assert.match(table,/案件が0件という意味ではありません/);
    assert.doesNotMatch(table,/0件表示|取得完了|官公需情報ポータル収録分/);
  }
});

test("browser search results render in the Lark-compatible table for all nine combinations",async()=>{
  const {default:Results}=await vite.ssrLoadModule('/app/collection-table.tsx');
  for(const mode of ['sfl','engineer','academy'])for(const sourceId of ['gsdf','msdf','asdf']){
    const result={method:'official-browser',items:[{id:'fixture',title:'Webサイト制作業務・表示確認',agency:'掲載元の契約機関',officialUrl:`https://www.mod.go.jp/${sourceId}/notice.pdf`,source:'確認対象',sourceUrl:`https://www.mod.go.jp/${sourceId}/`,deadline:'2099-09-25',deadlineEvidence:'見積書提出期限：2099年9月25日',matchedKeywords:['Webサイト'],summary:'テスト用の公告本文。全省庁統一資格を有する者。'}],sources:[{title:'確認対象',status:'partial',count:1}],collectedAt:'2026-09-11T06:00:00Z',search:{sourceId,scope:'fulltext',keywords:['Webサイト'],searchedOn:'2026-09-11',deadlineFrom:'2026-09-12',deadlinePolicy:'future-only'}};
    const html=renderToStaticMarkup(React.createElement(Results,{mode,sourceId,result,loading:false,error:'',onRegister(){}}));
    assert.match(html,/Webサイト制作業務・表示確認/);assert.match(html,/公式ページ・公告資料の確認分/);
    for(const field of ['都道府県','種別管理','案件先機関名','案件先URL','提出期限','Larkへ登録'])assert.ok(html.includes(field));
    assert.doesNotMatch(html,/官公需情報ポータル収録分|まだ結果を取得していません/);
  }
});


test("provenance distinguishes API from direct origins and rejects unsafe links",async()=>{
  const { DiscoveryProvenance }=await vite.ssrLoadModule("/app/discovery-provenance.tsx");
  const item={source:"海上自衛隊",sourceUrl:"https://www.kkj.go.jp/s/",origins:["https://www.kkj.go.jp/s/","https://www.mod.go.jp/msdf/bukei/koubo_idx.html","javascript:alert(1)"],officialUrl:"https://www.mod.go.jp/msdf/notice.pdf",lastSeen:Date.parse("2026-09-16T05:00:00Z")};
  const html=renderToStaticMarkup(React.createElement(DiscoveryProvenance,{item}));
  for(const value of ["官公需情報ポータル API","防衛省・自衛隊の公式掲載ページ","https://www.mod.go.jp/msdf/notice.pdf","2026/09/16 14:00"])assert.ok(html.includes(value),value);
  assert.equal((html.match(/href="https:\/\/www.kkj.go.jp\/s\/"/g)||[]).length,1);
  assert.doesNotMatch(html,/javascript:/);
  const legacy=renderToStaticMarkup(React.createElement(DiscoveryProvenance,{item:{source:"掲載元",officialUrl:"javascript:alert(1)"}}));
  assert.ok(legacy.includes("掲載元URL：記録なし"));assert.ok(legacy.includes("最終取得確認：記録なし"));assert.doesNotMatch(legacy,/<a/);
});
