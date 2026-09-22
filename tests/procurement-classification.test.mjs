import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({configFile:false,appType:"custom",root,resolve:{alias:{"@":root}},server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const { classifyProcurement: classify, matchesResultCategory: matches } = await vite.ssrLoadModule("/lib/procurement-classification.ts");
const required = "令和7・8・9年度全省庁統一資格において「役務の提供等」の「A」、「B」、「C」、又は「D」の等級に格付けされ、関東・甲信越地域の競争参加資格を有する者。";

test("open counter and required qualification can overlap, including spelling and grade alternatives",()=>{
  const classification=classify({title:"オープン・カウンタ方式による印刷業務",description:required});
  assert.ok(classification.openCounterEvidence);
  assert.ok(classification.unifiedRequiredEvidence);
  const item={classification};
  assert.equal(matches(item,"all"),true);
  assert.equal(matches(item,"open-counter"),true);
  assert.equal(matches(item,"unified-required"),true);
  assert.ok(classify({title:"印刷業務",description:"本件はオープンカウンター方式により見積書を募集します。"}).openCounterEvidence);
  assert.ok(classify({title:"印刷業務",description:"",contractMethod:"オープンカウンター"}).openCounterEvidence);
  assert.ok(classify({title:"電卓４台外２３点購入",description:"調達案件番号0000000000000622308調達種別オープンカウンタ（少額）への参加募集情報分類物品・役務",contractMethod:"一般競争入札"}).openCounterEvidence);
});

test("optional, negative, alternative and ambiguous qualification clauses are not labelled required",()=>{
  for (const description of [
    "全省庁統一資格は不要です。",
    "全省庁統一資格の有無を問わず参加できます。",
    "全省庁統一資格を有していない者も見積書を提出できます。",
    required+"ただし、全省庁統一資格を有しない者でも参加を認めます。",
    "次のいずれかの資格を有すること。(1)"+required+"(2)市の名簿に登録されている者。",
    "全省庁統一資格を有する者又は本市の名簿に登録されている者。",
    "本市の名簿に登録されている者又は全省庁統一資格を有する者。",
    "全省庁統一資格について。市の登録資格を有する者であること。",
    "全省庁統一資格の申請案内・関連リンク",
  ]) assert.equal(classify({title:"印刷業務",description}).unifiedRequiredEvidence,undefined,description);
  assert.deepEqual(classify({title:"一般競争入札",description:"",qualifications:"A B C D"}),{});
  assert.deepEqual(classify({title:"印刷業務",description:"ホーム オープンカウンター お知らせ 全省庁統一資格"}),{});
  assert.equal(matches({},"all"),false);
  assert.equal(matches({},"open-counter"),false);
  assert.equal(matches({},"unified-required"),false);
});

test("classification uses the full returned notice, beyond the summary excerpt",async()=>{
  const { parseSearchResponse }=await vite.ssrLoadModule("/lib/procurement-search.ts");
  const description="研修業務の概要。"+"業務内容の詳細。".repeat(70)+required;
  const xml=`<Results><SearchHits>1</SearchHits><SearchResult><ProjectName>研修業務</ProjectName><ExternalDocumentURI>https://example.test/notice</ExternalDocumentURI><ProjectDescription>${description}</ProjectDescription></SearchResult></Results>`;
  const item=parseSearchResponse(xml,["研修"]).items[0];
  assert.ok(!item.summary.includes("全省庁統一資格"));
  assert.ok(item.classification.unifiedRequiredEvidence.includes("全省庁統一資格"));
});


test("municipal notices remain candidates even when registration is required or unknown",()=>{
  for(const descriptionText of ["本市の入札参加資格者名簿に登録されている者。","仕様書を参照。","全省庁統一資格は利用できない。"]){
    const item={title:"マッチングシステム構築",agency:"豊中市",officialUrl:"https://www.city.toyonaka.osaka.jp/notice",descriptionText};
    assert.equal(matches(item,"all"),true);
    assert.equal(matches(item,"municipal"),true);
    assert.equal(matches(item,"unified-required"),false);
  }
  assert.equal(matches({title:"開発",agency:"国土交通省近畿地方整備局",officialUrl:"https://www.example.go.jp",descriptionText:required},"municipal"),false);
});
test("national qualification exclusions remain while municipal notices become candidates",()=>{
  const base={title:"オープンカウンター方式による印刷業務",agency:"防衛省",officialUrl:"https://www.mod.go.jp/notice.pdf"};
  assert.equal(matches({...base,descriptionText:"見積書を募集します。"},"all"),true);
  assert.equal(matches({...base,descriptionText:"本市の競争入札参加資格者名簿に登載されていること。"},"all"),false);
  assert.equal(matches({...base,descriptionText:"防衛省の建設工事競争参加資格を有する者。"},"all"),false);
  assert.equal(matches({...base,agency:"滋賀県",descriptionText:"全省庁統一資格は不要ですが、本県の入札参加資格者名簿に登録されている者。"},"all"),true);
  assert.equal(matches({...base,agency:"滋賀県",officialUrl:"https://www.pref.shiga.lg.jp/notice",descriptionText:"見積を募集。"},"all"),true);
  assert.equal(matches({...base,agency:"滋賀県",descriptionText:"本県の入札参加資格者名簿への登録は不要です。"},"all"),true);
  assert.equal(matches({...base,agency:"国土交通省近畿地方整備局",prefecture:"滋賀県",descriptionText:"見積を募集。"},"all"),true);
  assert.equal(matches({...base,title:"印刷業務",agency:"防衛省",descriptionText:"ホーム オープンカウンター 関連リンク 全省庁統一資格"},"all"),false);
});
test("saved evidence is re-evaluated and an independent local requirement still vetoes an old unified label",()=>{
  assert.equal(matches({classification:{unifiedRequiredEvidence:required},descriptionText:"本市の入札参加資格者名簿に登載されている者。"},"all"),false);
  assert.equal(matches({classification:{unifiedRequiredEvidence:required}},"all"),true);
});


test("reclassification retains optional unified routes without relabelling them mandatory",async()=>{
  const {currentClassification}=await vite.ssrLoadModule('/lib/procurement-classification.ts');
  const item={title:'研修',descriptionText:'本市の名簿に登録されている者又は全省庁統一資格を有する者。',classification:{unifiedRequiredEvidence:'全省庁統一資格を有する者'}};
  const classification=currentClassification(item);
  assert.ok(classification.unifiedEligibleEvidence);assert.equal(classification.unifiedRequiredEvidence,undefined);
  assert.equal(currentClassification({...item,classification}).unifiedRequiredEvidence,undefined);
});
