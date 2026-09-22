import { fetchWithoutRedirects } from "./http-fetch";
import { db } from "./server-store";
import { officialDefenseUrl } from "./defense-browser-parser";
import { boundedBytes, BrowserFetchError, browserConfiguration, fetchBrowserHtml, fetchOfficialPdf, fetchOfficialPdfListing, type OfficialPdfDocument } from "./defense-browser-client";
import { officialHttpError } from "./defense-fetch-error";

export async function cachedDocument(url:string,kind:string,ttl:number,load:()=>Promise<string>,refresh=false) {
  const row=await db().prepare("SELECT body, fetched_at FROM discovery_cache WHERE url=? AND kind=?").bind(url,kind).first<{body:string;fetched_at:number}>();
  if(!refresh && row && Date.now()-row.fetched_at<ttl)return row.body;
  const body=await load();
  if(new TextEncoder().encode(body).length<1_500_000) await db().prepare("INSERT INTO discovery_cache (url,body,kind,fetched_at) VALUES (?,?,?,?) ON CONFLICT(url) DO UPDATE SET body=excluded.body,kind=excluded.kind,fetched_at=excluded.fetched_at").bind(url,body,kind,Date.now()).run();
  return body;
}
export function robotsAllows(text:string,path:string) {
  const groups:{agents:string[];rules:{allow:boolean;path:string}[]}[]=[];let group:typeof groups[number]|undefined;
  for(const raw of text.split(/\r?\n/)) {
    const line=raw.split("#")[0].trim(),i=line.indexOf(":");if(i<0)continue;
    const k=line.slice(0,i).toLowerCase(),v=line.slice(i+1).trim();
    if(k==="user-agent") {if(!group||group.rules.length){group={agents:[],rules:[]};groups.push(group);}group.agents.push(v.toLowerCase());}
    if(group&&(k==="allow"||k==="disallow")&&v)group.rules.push({allow:k==="allow",path:v});
  }
  const specific=groups.filter(g=>g.agents.some(a=>a!=="*"&&"sfl-bid-portal".includes(a)));
  const selected=specific.length?specific:groups.filter(g=>g.agents.includes("*"));
  const rules=selected.flatMap(g=>g.rules).filter(r=>{
    const expression=r.path.split("*").map(p=>p.replace(/[.+?^{}()|[\]\\]/g,"\\$&")).join(".*");
    try{return new RegExp("^"+expression).test(path);}catch{return path.startsWith(r.path);}
  }).sort((a,b)=>b.path.replace(/\*/g,"").length-a.path.replace(/\*/g,"").length||Number(b.allow)-Number(a.allow));
  return !rules.length||rules[0].allow;
}
async function checkRobots(url:string,signal?:AbortSignal) {
  const text=await cachedDocument("https://www.mod.go.jp/robots.txt","robots",86400000,async()=>{
    const r=await fetchWithoutRedirects("https://www.mod.go.jp/robots.txt",{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),headers:{"User-Agent":"SFL-Bid-Portal/3.0"}});
    if(r.status===404){await r.body?.cancel();return "# not published";}
    if(!r.ok){await r.body?.cancel();throw new BrowserFetchError(`robots.txtを確認できないため停止（HTTP ${r.status}）`,true);}
    return new TextDecoder().decode(await boundedBytes(r,128000));
  });
  const u=new URL(url);if(!robotsAllows(text,u.pathname+u.search))throw new BrowserFetchError("robots.txtで取得対象外のため未確認です。");
}
async function rawHtml(url:string,budgetSignal?:AbortSignal) {
  let current=officialDefenseUrl(url);if(!current)throw new BrowserFetchError("公式の調達ページ以外は取得できません。");
  const signal=budgetSignal?AbortSignal.any([budgetSignal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000);
  for(let n=0;n<4;n++) {
    await checkRobots(current,signal);
    const r=await fetch(current,{redirect:"manual",signal,headers:{Accept:"text/html","User-Agent":"SFL-Bid-Portal/3.0"}});
    if([301,302,303,307,308].includes(r.status)) {const next=officialDefenseUrl(r.headers.get("location")??"",current);await r.body?.cancel();if(!next)throw new BrowserFetchError("移動先を確認できませんでした。");current=next;continue;}
    if(!r.ok){await r.body?.cancel();throw officialHttpError(r.status);}
    const bytes=await boundedBytes(r,2*1024*1024);
    const header=r.headers.get("content-type")??"";
    const probe=new TextDecoder().decode(bytes.slice(0,8000));
    const charset=(header+" "+probe).match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]??"utf-8";
    let html:string;try{html=new TextDecoder(charset).decode(bytes);}catch{throw new BrowserFetchError("ページの文字コードを確認できませんでした。");}
    if(/verify you are human|access denied|captcha|just a moment|checking your browser|アクセスが拒否|ロボットではない/i.test(html.slice(0,20000)))throw officialHttpError(403);
    const text=html.replace(/<script\b[\s\S]*?<\/script>/gi,"").replace(/<[^>]*>/g,"").trim();
    if(text.length<30 && /<script\b/i.test(html)) {
      if(!browserConfiguration().configured)throw new BrowserFetchError("画面描画が必要なページです。ブラウザー接続の設定待ちです。");
      const rendered=await fetchBrowserHtml(current,signal);return rendered;
    }
    return {html,url:current};
  }
  throw new BrowserFetchError("移動が多いため未確認です。");
}
export const createOfficialTransport=(signal?:AbortSignal)=>({
  html:async(url:string,options?:{refresh?:boolean}):Promise<{html:string;url:string}>=>JSON.parse(await cachedDocument(url,"html",6*3600000,async()=>JSON.stringify(await rawHtml(url,signal)),options?.refresh)),
  pdf:async(url:string)=>{signal?.throwIfAborted();await checkRobots(url,signal);return cachedDocument(url,"pdf-text",6*3600000,()=>fetchOfficialPdf(url,signal));},
  pdfListing:async(url:string):Promise<OfficialPdfDocument>=>{signal?.throwIfAborted();await checkRobots(url,signal);return JSON.parse(await cachedDocument(url,"pdf-listing",6*3600000,async()=>JSON.stringify(await fetchOfficialPdfListing(url,signal))));},
});
export const officialTransport=createOfficialTransport();
