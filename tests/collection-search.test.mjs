import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  configFile: false, appType: "custom", root,
  resolve: { alias: [
    { find: "@/lib/member-auth", replacement: "\0collection-test-auth" },
    { find: "@/lib/server-store", replacement: "\0collection-test-store" },
    { find: "@", replacement: root },
  ] },
  plugins: [{ name: "collection-test-fixtures", resolveId(id) { if (id.startsWith("\0collection-test-")) return id; }, load(id) {
    if (id === "\0collection-test-auth") return "export async function requireSearchMember() {}";
    if (id === "\0collection-test-store") return `
      export class ApiError extends Error { constructor(status,message){super(message);this.status=status;} }
      export function checkMutation() {} export async function requireMember() {}
      export const jsonBody = request => request.json();
      export const reply = (data,status=200) => Response.json(data,{status});
      export const failure = error => Response.json({error:error.message},{status:error.status||500});
    `;
  } }],
  server: { middlewareMode: true, hmr: false },
});
after(async () => { await vite.close(); });

const request = (keywords,options={}) => new Request("https://app.example.test/api/collect", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({keywords,...options}) });
const record = (title="イベント申込管理システム構築業務の募集",url="https://agency.example.test/notice.pdf") => `<SearchResult><Key><![CDATA[record1]]></Key><ProjectName>${title}</ProjectName><ExternalDocumentURI><![CDATA[${url}]]></ExternalDocumentURI><OrganizationName>発注機関テスト</OrganizationName><CftIssueDate>2026-09-10T00:00:00+09:00</CftIssueDate><PeriodEndTime>2027-03-31</PeriodEndTime><TenderSubmissionDeadline>2026-10-01</TenderSubmissionDeadline><OpeningTendersEvent>2026-10-02</OpeningTendersEvent><ProjectDescription>全省庁統一資格を有する者。イベント申込管理システム構築業務の仕様 &amp; 条件を公開。入札書の受領期限：2099年10月5日17時まで。</ProjectDescription></SearchResult>`;
const xml = (hits,records="")=>`<?xml version="1.0"?><Results><Version>1.0</Version><SearchResults><SearchHits>${hits}</SearchHits>${records}</SearchResults></Results>`;

test("oversized searches automatically show at most 20 ranked future candidates in every audience",async(t)=>{
  t.mock.timers.enable({apis:["Date"],now:new Date("2026-09-11T15:01:00Z")});
  const { POST }=await vite.ssrLoadModule("/app/api/collect/route.ts");
  const { collectionModes }=await vite.ssrLoadModule("/lib/collection-profiles.ts");
  const originalFetch=globalThis.fetch;
  try {
    for(const mode of collectionModes){
      const words=mode.defaultKeyword.split("、");
      const portal="https://www.mod.go.jp/j/notice/";
      const entry=(id,title,date,description=words.slice(0,2).join(" "),url=portal+id)=>record(title,url)
        .replace("record1",id).replace(/<ProjectDescription>[\s\S]*?<\/ProjectDescription>/,`<ProjectDescription>全省庁統一資格を有する者。${description}。入札書の受領期限：${date}17時まで。</ProjectDescription>`);
      const best=entry("best",`${words[0]} ${words[1]}`,"2099年10月20日");
      const second=entry("second",`${words[0]} ${words[1]}の募集`,"2099年10月21日");
      const oneMatch=entry("one",words[0],"2099年10月1日",words[0]);
      const bodyMatch=entry("body","仕様の募集","2099年9月30日");
      const remainder=Array.from({length:22},(_,i)=>entry(`extra${i}`,`${words[0]}の募集${i}`,"2099年10月10日",words[0]));
      const records=[bodyMatch,oneMatch,...remainder,second,best,
        entry("today",`${words[0]} ${words[1]}当日締切`,"2026年9月12日"),
        entry("closed",`${words[0]} ${words[1]}期限切れ`,"2026年9月11日"),
        entry("unknown",`${words[0]} ${words[1]}締切不明`,"9月20日"),
        entry("other",`${words[0]} ${words[1]}別サイト`,"2099年9月30日",words.join(" "),"https://other.example.test/notice")];
      const urls=[],signals=[];
      let cancelled=false;
      globalThis.fetch=async(url,init)=>{
        urls.push(new URL(url));signals.push(init.signal);
        if(urls.length===1)return new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{"Content-Length":String(12*1024*1024+1)}});
        return new Response(xml(900,records.join("")));
      };
      const response=await POST(request(mode.defaultKeyword,{sourceId:"mod"}));
      assert.equal(response.status,200);
      const result=await response.json();
      assert.equal(cancelled,true,"oversized response must be cancelled before retry");
      assert.deepEqual(urls.map(url=>url.searchParams.get("Count")),["300","50"]);
      urls.forEach(url=>url.searchParams.delete("Count"));
      assert.equal(urls[0].href,urls[1].href,"only the requested count may change");
      assert.equal(signals[0],signals[1],"retries share one timeout budget");
      assert.deepEqual(result.search.keywords,words);
      assert.equal(result.items.length,20);
      assert.deepEqual(result.items.slice(0,3).map(item=>item.id),["best","second","one"],"title matches, keyword count, then deadline determine priority");
      assert.equal(result.items.some(item=>["today","closed","unknown","other","body"].includes(item.id)),false);
      assert.ok(result.items.every(item=>item.searchSourceId==="mod"));
      assert.deepEqual(result.deadlineStats,{future:26,closed:2,unknown:1});
      assert.equal(result.limit,20);
      assert.equal(result.recommendation.reason,"response-too-large");
      assert.match(result.recommendation.basis,/件名での一致を優先/);
      assert.equal(result.totalHits,undefined);
      assert.equal(result.sources[0].status,"partial");
      assert.equal(result.sources[0].count,20);
      assert.match(result.message,/おすすめ20件/);
      assert.match(result.scopeNotice,/検索先全体の検索件数ではありません/);
      assert.doesNotMatch(result.scopeNotice,/キーワードを絞る/);
    }
  } finally {globalThis.fetch=originalFetch;}
});

test("streamed oversized bodies retry progressively, preserve title/source filters and keep subset zero explicit",async()=>{
  const { POST }=await vite.ssrLoadModule("/app/api/collect/route.ts");
  const originalFetch=globalThis.fetch;
  const chunk=new Uint8Array(1024*1024).fill(32);
  let cancelled=0;
  const urls=[];
  globalThis.fetch=async url=>{
    urls.push(new URL(url));
    if(urls.length<=2)return new Response(new ReadableStream({pull(controller){controller.enqueue(chunk);},cancel(){cancelled++;}}));
    return new Response(xml(1,record("陸上自衛隊の研修").replace("発注機関テスト","防衛省").replace("2099年10月5日","2000年10月5日")));
  };
  try {
    const response=await POST(request("研修、清掃",{sourceId:"mod",scope:"title"}));
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(cancelled,2);
    assert.deepEqual(urls.map(url=>url.searchParams.get("Count")),["300","50","10"]);
    for(const url of urls){
      assert.equal(url.searchParams.get("Project_Name"),"研修 OR 清掃");
      assert.equal(url.searchParams.get("Organization_Name"),"防衛省");
      assert.equal(url.searchParams.get("Query"),null);
    }
    assert.equal(data.items.length,0,"expired records must never fill recommendation slots");
    assert.equal(data.totalHits,undefined,"even a small fallback response remains a partial search");
    assert.equal(data.sources[0].status,"partial");
    assert.equal(data.recommendation.limit,20);
    assert.match(data.message,/取得した情報の中に/);
  } finally {globalThis.fetch=originalFetch;}
});

test("fallback retries are bounded and failed recovery never returns a successful zero",async()=>{
  const { POST }=await vite.ssrLoadModule("/app/api/collect/route.ts");
  const originalFetch=globalThis.fetch;
  const oversized=()=>new Response("",{headers:{"Content-Length":String(12*1024*1024+1)}});
  try {
    const counts=[];
    globalThis.fetch=async url=>{counts.push(new URL(url).searchParams.get("Count"));return oversized();};
    const response=await POST(request("研修"));
    const failure=await response.json();
    assert.equal(response.status,502);
    assert.deepEqual(counts,["300","50","10","1"]);
    assert.match(failure.error,/取得件数を減らしても/);
    assert.match(failure.error,/0件という意味ではありません/);
    assert.equal(failure.items,undefined);
    for(const recovery of [()=>new Response("maintenance",{status:503}),()=>new Response("<html>bad XML</html>"),()=>{throw new DOMException("timeout","TimeoutError");}]){
      let requests=0;
      globalThis.fetch=async()=>++requests===1?oversized():recovery();
      const failed=await POST(request("研修"));
      assert.ok(failed.status>=500);
      assert.equal(requests,2,"only byte-limit errors trigger retries");
      assert.equal((await failed.json()).items,undefined);
    }
    let requests=0;
    globalThis.fetch=async()=>++requests<=3?oversized():new Response(xml(1,record()));
    const small=await (await POST(request("システム"))).json();
    assert.equal(requests,4);
    assert.equal(small.items.length,1,"a one-record fallback can still succeed");
    assert.equal(small.recommendation.limit,20);
  } finally {globalThis.fetch=originalFetch;}
});

test("deadline extraction requires an explicit submission label and unambiguous closing date",async()=>{
  const { extractBidDeadline } = await vite.ssrLoadModule("/lib/procurement-deadline.ts");
  const examples = [
    ["入札書の受領期限 令和８年９月３０日（水）午後５時", "2026-09-30"],
    ["見積書提出締切：2026/10/02 17:00", "2026-10-02"],
    ["入札締切日：2026-10-02", "2026-10-02"],
    ["企画提案書等提出期間 令和8年9月10日(木)から令和8年10月6日(火)午後3時まで(必着)", "2026-10-06"],
    ["入札書受付期間：2026年9月1日午前9時～9月20日午後5時まで", "2026-09-20"],
    ["入札書の提出場所、受領期限及び提出方法(1)提出場所 発注機関 (2)受領期限 令和8年10月6日17時(必着)まで", "2026-10-06"],
    ["<p>入 札 書 の 提 出 期 限</p><p>令和 8 年 9 月 25 日</p>", "2026-09-25"],
    ["入札書の受領期限：2026年9月20日。入札書提出期限：2026年9月20日。", "2026-09-20"],
  ];
  for(const [description,expected] of examples){
    assert.equal(extractBidDeadline(description)?.date,expected,description);
    assert.ok(extractBidDeadline(description).evidence);
  }
  for(const description of [
    "入札開始日：2026年10月1日。開札日：2026年10月2日。納入期限：2027年3月31日。",
    "参加申請書提出期限：2026年9月20日。質問書提出期限：2026年9月21日。",
    "入札書受領期限 (6)開札の日時及び場所 2026年10月2日",
    "入札書提出期限：詳細は別紙。公告日：2026年10月1日。",
    "入札書提出期限：9月30日。公告：2026年9月1日。",
    "入札書受付期間：2026年9月1日から別紙のとおり",
    "入札書受付期間：2026年9月1日",
    "入札書提出期限：2026年2月30日",
    "入札書提出期限：2026年9月20日。郵送入札書提出期限：2026年9月18日。",
    "<script>入札書提出期限：2026年10月1日</script>詳細は公式ページで確認",
  ]) assert.equal(extractBidDeadline(description),undefined,description);
  const {parseSearchResponse} = await vite.ssrLoadModule("/lib/procurement-search.ts");
  const unknown = record().replace(/<ProjectDescription>[\s\S]*?<\/ProjectDescription>/,"<ProjectDescription>仕様を公開</ProjectDescription>");
  assert.equal(parseSearchResponse(xml(1,unknown),["仕様"]).items[0].deadline,"","API start/opening/delivery fields must never stand in for a bid closing date");
});

test("all search audiences enforce strict future deadlines using the server's JST search day",async(t)=>{
  t.mock.timers.enable({apis:["Date"],now:new Date("2026-09-11T15:01:00Z")});
  const { POST } = await vite.ssrLoadModule("/app/api/collect/route.ts");
  const { collectionModes } = await vite.ssrLoadModule("/lib/collection-profiles.ts");
  const { isFutureBidDeadline } = await vite.ssrLoadModule("/lib/procurement-deadline.ts");
  const originalFetch = globalThis.fetch;
  const entry=(name,date)=>record(name).replace("2099年10月5日",date);
  const responseXml=xml(5,
    entry("未来の案件", "2026年9月14日")+entry("直近の案件","2026年9月13日")+
    entry("当日締切の案件", "2026年9月12日")+entry("過去の案件", "2026年9月11日")+
    entry("締切不明の案件","9月15日"));
  globalThis.fetch=async url=>{
    assert.equal(new URL(url).searchParams.get("CFT_Issue_Date"),null);
    return new Response(responseXml);
  };
  try {
    for(const mode of collectionModes){
      const response=await POST(request(mode.defaultKeyword,{days:365,searchedOn:"2000-01-01",deadlinePolicy:"all"}));
      assert.equal(response.status,200);
      const data=await response.json();
      assert.equal(data.search.searchedOn,"2026-09-12");
      assert.equal(data.search.deadlineFrom,"2026-09-13");
      assert.equal(data.search.deadlinePolicy,"future-only");
      assert.deepEqual(data.items.map(item=>item.title),["直近の案件","未来の案件"]);
      assert.deepEqual(data.deadlineStats,{future:2,closed:2,unknown:1});
      assert.equal(data.sources[0].count,2);
      assert.equal(data.sources[0].status,"partial");
      assert.equal(data.totalHits,undefined);
    }
    assert.equal(isFutureBidDeadline("2027-01-01","2026-12-31"),true);
    assert.equal(isFutureBidDeadline("2026-09-12","2026-09-12"),false);
    assert.equal(isFutureBidDeadline("2026-02-30","2026-02-01"),false);
    globalThis.fetch=async()=>new Response(xml(1,entry("締切不明","9月15日")));
    const empty=await (await POST(request("研修"))).json();
    assert.equal(empty.items.length,0);
    assert.equal(empty.deadlineStats.unknown,1);
    assert.match(empty.message,/取得した情報の中に/);
    assert.match(empty.scopeNotice,/全体の検索件数ではありません/);
  } finally {globalThis.fetch=originalFetch;}
});

test("all 31 engineer terms reach official search and map real XML fields without inventing deadlines", async () => {
  const { collectionModes, engineerWebKeywords, engineerSmallProjectKeywords } = await vite.ssrLoadModule("/lib/collection-profiles.ts");
  const { POST } = await vite.ssrLoadModule("/app/api/collect/route.ts");
  const keyword = collectionModes.find(mode => mode.id === "engineer").defaultKeyword;
  assert.equal(engineerWebKeywords.length, 14);
  assert.equal(engineerSmallProjectKeywords.length, 17);
  assert.equal(keyword.split("、").length, 31);
  assert.ok(keyword.length <= 1000);
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async url => {
    requests++;
    const parsed = new URL(url);
    assert.equal(parsed.origin,"https://www.kkj.go.jp");
    assert.equal(parsed.pathname,"/api/");
    assert.deepEqual(parsed.searchParams.get("Query").split(" OR "),keyword.split("、"));
    assert.equal(parsed.searchParams.get("Count"),"300");
    return new Response(xml(42,record()));
  };
  try {
    const response = await POST(request(keyword));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.items.length, 1);
    assert.deepEqual(data.items[0].matchedKeywords, ["イベント申込管理システム構築業務"]);
    assert.equal(data.totalHits,undefined);
    assert.equal(data.upstreamHits,42);
    assert.equal(data.returnedCount,1);
    assert.equal(data.items[0].agency,"発注機関テスト");
    assert.equal(data.items[0].deadline,"2099-10-05");
    assert.match(data.items[0].deadlineEvidence,/入札書の受領期限/);
    assert.equal(data.items[0].indexedDate,"2026-09-10");
    assert.match(data.items[0].summary,/ & /);
    assert.equal(data.items[0].matchLocation,"title");
    assert.equal(requests, 1);
    const tooMany = await POST(request(Array.from({length:51}, (_,i)=>`検索語${i}`).join("、")));
    assert.equal(tooMany.status, 400);
    assert.match((await tooMany.json()).error, /50語/);
    assert.equal((await POST(request({invalid:true}))).status, 400);
    assert.equal((await POST(request("研修",{scope:"unknown"}))).status, 400);
    assert.equal(requests, 1, "invalid requests must not collect from external sites");
  } finally { globalThis.fetch = originalFetch; }
});

test("zero results are distinct from HTTP, HTML, service error and truncated responses", async () => {
  const { POST } = await vite.ssrLoadModule("/app/api/collect/route.ts");
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async ()=>new Response(xml(0));
    const zero = await POST(request("研修"));
    assert.equal(zero.status,200);
    assert.equal((await zero.json()).totalHits,0);
    for (const [body,status] of [["maintenance",503],["<html>error</html>",200],["<Results><Error>search disabled</Error></Results>",200],[xml(4),200],[xml(1,record()).replace("</SearchResult>",""),200]]) {
      globalThis.fetch = async ()=>new Response(body,{status});
      const response = await POST(request("研修"));
      assert.equal(response.status,502);
      const data = await response.json();
      assert.ok(data.error);
      assert.equal(data.items,undefined);
      assert.equal(data.totalHits,undefined);
    }
    globalThis.fetch = async ()=>{ throw new Error("connection failed"); };
    assert.equal((await POST(request("研修"))).status,504);
  } finally { globalThis.fetch=originalFetch; }
});

test("all defense sources require the browser route and never fall back to KKJ in any audience",async()=>{
  const { POST }=await vite.ssrLoadModule("/app/api/collect/route.ts");
  const { buildSearchUrl,searchProcurements }=await vite.ssrLoadModule("/lib/procurement-search.ts");
  const { collectionModes }=await vite.ssrLoadModule("/lib/collection-profiles.ts");
  const originalFetch=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error("must not contact KKJ for browser sources");};
  try {
    for(const mode of collectionModes) for(const sourceId of ["gsdf","msdf","asdf"]) {
      const response=await POST(request(mode.defaultKeyword,{sourceId}));
      assert.equal(response.status,503);
      const result=await response.json();
      assert.equal(result.code,"browser_not_connected");
      assert.match(result.error,/案件が0件という意味ではありません/);
      assert.equal(result.items,undefined);
      assert.throws(()=>buildSearchUrl(["清掃"],{sourceId,scope:"fulltext"}),/ブラウザー検索/);
      await assert.rejects(searchProcurements(["清掃"],{sourceId,scope:"title"}),/ブラウザー検索/);
    }
    assert.equal(calls,0);
  }finally{globalThis.fetch=originalFetch;}
});

test("title filters without announcement lookback, CDATA, deduplication and unsafe links are handled correctly", async () => {
  const { parseSearchResponse,buildSearchUrl } = await vite.ssrLoadModule("/lib/procurement-search.ts");
  const url=buildSearchUrl(["研修","清掃"],{scope:"title"},"2026-09-11");
  assert.equal(url.searchParams.get("Project_Name"),"研修 OR 清掃");
  assert.equal(url.searchParams.get("Query"),null);
  assert.equal(url.searchParams.get("CFT_Issue_Date"),null);
  assert.equal(url.searchParams.get("Tender_Submission_Deadline"),null,"bid start must not become the closing-date filter");
  const result=parseSearchResponse(xml(4,record()+record()+record("別の公告")+record("危険なリンク","javascript:alert(1)")),["システム"]);
  assert.equal(result.items.length,2);
  assert.equal(result.skippedCount,2);
  assert.equal(result.items[1].matchLocation,"body");
  assert.throws(()=>parseSearchResponse('<!DOCTYPE Results [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+xml(0),["研修"]));
});

test("source selection reaches the official query and filters source identity, with incomplete counts kept explicit", async () => {
  const { POST } = await vite.ssrLoadModule("/app/api/collect/route.ts");
  const { buildSearchUrl } = await vite.ssrLoadModule("/lib/procurement-search.ts");
  const { matchesProcurementSource } = await vite.ssrLoadModule("/lib/procurement-sources.ts");
  const originalFetch = globalThis.fetch;
  const portal = "https://www.p-portal.go.jp/pps-web-biz/UAA01/OAA0101";
  const defenseRecord = (title,url=portal) => record(title,url).replace("発注機関テスト","防衛省");
  try {
    for (const [sourceId,term] of [["mod",null]]) {
      globalThis.fetch = async url => {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get("Organization_Name"),"防衛省");
        if (term) assert.ok(parsed.searchParams.get("Query").includes(term));
        assert.ok(parsed.searchParams.get("Query").includes("清掃"));
        return new Response(xml(1,defenseRecord(`${term??"防衛省"} 清掃業務`)));
      };
      const response=await POST(request("清掃",{sourceId}));
      assert.equal(response.status,200);
      const data=await response.json();
      assert.equal(data.search.sourceId,sourceId);
      assert.equal(data.items.length,1);
      assert.equal(data.items[0].searchSourceId,sourceId);
      const titleUrl=buildSearchUrl(["清掃"],{scope:"title",sourceId},"2026-09-11");
      assert.equal(titleUrl.searchParams.get("Project_Name"),"清掃");
      if(term) assert.ok(titleUrl.searchParams.get("Query").includes(term));
    }
    assert.equal(matchesProcurementSource("msdf",{agency:"防衛省",title:"（陸自）八戸駐屯地の清掃",officialUrl:portal}),false);
    assert.equal(matchesProcurementSource("gsdf",{agency:"防衛省",title:"（陸自）八戸駐屯地の清掃",officialUrl:portal}),true);
    assert.equal(matchesProcurementSource("asdf",{agency:"防衛省",title:"清掃",officialUrl:"https://www.mod.go.jp/asdf/notice.pdf"}),true);
    assert.equal(matchesProcurementSource("asdf",{agency:"他の機関",title:"清掃",officialUrl:"https://www.mod.go.jp.evil.test/asdf/notice.pdf"}),false);
    assert.equal(matchesProcurementSource("p-portal",{agency:"発注元",officialUrl:"https://www.p-portal.go.jp.evil.test/notice"}),false);
    globalThis.fetch=async url=>{
      assert.equal(new URL(url).searchParams.get("Count"),"300");
      return new Response(xml(900,defenseRecord("清掃",portal)+record("別サイト","https://example.test/notice")));
    };
    const partial=await (await POST(request("清掃",{sourceId:"mod"}))).json();
    assert.equal(partial.items.length,1);
    assert.equal(partial.totalHits,undefined,"900 upstream hits are not 900 defense hits");
    assert.equal(partial.sources[0].status,"partial");
    assert.equal(partial.inspectedCount,2);
    assert.ok(partial.scopeNotice.includes("全体の検索件数ではありません"));
    globalThis.fetch=async()=>new Response(xml(900,record("別サイト","https://example.test/notice")));
    const emptyPartial=await (await POST(request("清掃",{sourceId:"mod"}))).json();
    assert.equal(emptyPartial.totalHits,undefined);
    assert.equal(emptyPartial.sources[0].status,"partial");
    globalThis.fetch=async()=>new Response(xml(1,defenseRecord("清掃",portal)));
    const complete=await (await POST(request("清掃",{sourceId:"mod"}))).json();
    assert.equal(complete.totalHits,1);
    globalThis.fetch=async()=>{throw new Error("invalid source must not request any external site");};
    assert.equal((await POST(request("清掃",{sourceId:"unknown"}))).status,400);
    assert.equal((await POST(request("清掃",{sourceId:"njss"}))).status,400);
    for (const sourceId of ["p-portal"]) {
      const external=await POST(request("清掃",{sourceId}));
      assert.equal(external.status,422);
      const unavailable = await external.json();
      assert.match(unavailable.error,/準備中/);
      assert.equal(unavailable.totalHits,undefined);
    }
  } finally { globalThis.fetch=originalFetch; }
});
