import { fetchWithoutRedirects } from "./http-fetch";
import { env } from "cloudflare:workers";
import { officialDefenseUrl } from "./defense-browser-parser";
import { BrowserFetchError, officialHttpError } from "./defense-fetch-error";
export { BrowserFetchError } from "./defense-fetch-error";

type BrowserBindings = { CLOUDFLARE_BROWSER_ACCOUNT_ID?: string; CLOUDFLARE_BROWSER_API_TOKEN?: string };
export function browserConfiguration() {
  const values = env as unknown as BrowserBindings;
  return { configured: /^[a-f0-9]{32}$/i.test(values.CLOUDFLARE_BROWSER_ACCOUNT_ID ?? "") && !!values.CLOUDFLARE_BROWSER_API_TOKEN?.trim() };
}
export async function boundedBytes(response: Response, max: number): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length") ?? 0) > max) { await response.body?.cancel(); throw new BrowserFetchError("資料が大きすぎるため、このページは未確認です。"); }
  if (!response.body) throw new BrowserFetchError("資料を受信できませんでした。");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size=0;
  try {
    while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>max){await reader.cancel();throw new BrowserFetchError("資料が大きすぎるため、このページは未確認です。");} chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;} return bytes;
}

// REST /content runs a real browser and returns rendered HTML. Link selection
// happens on the server; no scripts, credentials or cookies come from callers.
export async function fetchBrowserHtml(url: string, budgetSignal?: AbortSignal): Promise<{ html: string; url: string }> {
  if (!officialDefenseUrl(url)) throw new BrowserFetchError("指定先以外のURLは取得できません。");
  if (!browserConfiguration().configured) throw new BrowserFetchError("ブラウザー検索の接続設定が未完了です。",true);
  const values = env as unknown as BrowserBindings;
  try {
    const response=await fetchWithoutRedirects(`https://api.cloudflare.com/client/v4/accounts/${values.CLOUDFLARE_BROWSER_ACCOUNT_ID}/browser-rendering/content`,{
      method:"POST",signal:budgetSignal?AbortSignal.any([budgetSignal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000),
      headers:{"Authorization":`Bearer ${values.CLOUDFLARE_BROWSER_API_TOKEN}`,"Content-Type":"application/json"},
      body:JSON.stringify({url,gotoOptions:{waitUntil:"networkidle2",timeout:30000},actionTimeout:10000,bestAttempt:false,
        allowRequestPattern:["^https://www\\.mod\\.go\\.jp/"],rejectResourceTypes:["image","media","font"]}),
    });
    if ([401,403].includes(response.status)) { await response.body?.cancel();throw new BrowserFetchError("ブラウザー検索の認証・権限を確認してください。調査を一時停止しました。",true); }
    if (response.status===429) { await response.body?.cancel();throw new BrowserFetchError("ブラウザー検索の利用上限に達したため、一時停止しました。時間をおいて再開してください。",true); }
    if(!response.ok){await response.body?.cancel();throw new BrowserFetchError(`ブラウザー取得に失敗しました（HTTP ${response.status}）。`);}
    const data=JSON.parse(new TextDecoder().decode(await boundedBytes(response,6*1024*1024)));
    if(!data.success || typeof data.result!=="string") throw new BrowserFetchError("ブラウザーから正しいページを取得できませんでした。");
    const finalUrl=officialDefenseUrl(data.meta?.finalUrl ?? url);
    if(!finalUrl || (data.meta?.status && data.meta.status>=400)) throw new BrowserFetchError("公式ページの移動先または取得状態を確認できませんでした。");
    if(data.meta?.redirectChain?.some((r:{url:string})=>!officialDefenseUrl(r.url))) throw new BrowserFetchError("指定先以外への移動を検出したため、本文を採用しませんでした。");
    return {html:data.result,url:finalUrl};
  } catch(error) {
    if(error instanceof BrowserFetchError) throw error;
    // Never expose provider response bodies, tokens or request headers.
    throw new BrowserFetchError("ブラウザー取得がタイムアウトしたか、通信に失敗しました。");
  }
}

export type OfficialPdfDocument={text:string;links:{url:string;title:string}[]};
export async function fetchOfficialPdf(url: string, budgetSignal?: AbortSignal): Promise<string> {
  return (await readOfficialPdf(url,false,budgetSignal)).text;
}
export async function fetchOfficialPdfListing(url:string,budgetSignal?:AbortSignal):Promise<OfficialPdfDocument>{
  return readOfficialPdf(url,true,budgetSignal);
}
async function readOfficialPdf(url: string,listing:boolean,budgetSignal?:AbortSignal): Promise<OfficialPdfDocument> {
  let current=officialDefenseUrl(url);
  if(!current) throw new BrowserFetchError("指定先以外の資料は取得できません。");
  const signal=budgetSignal?AbortSignal.any([budgetSignal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000);
  for(let redirects=0;redirects<4;redirects++){
    const response=await fetch(current,{redirect:"manual",signal,headers:{Accept:"application/pdf"}});
    if([301,302,303,307,308].includes(response.status)){
      const next=officialDefenseUrl(response.headers.get("location")??"",current);await response.body?.cancel();
      if(!next)throw new BrowserFetchError("資料が指定先以外へ移動したため未確認です。");current=next;continue;
    }
    if(!response.ok){await response.body?.cancel();throw officialHttpError(response.status);}
    const bytes=await boundedBytes(response,8*1024*1024);
    if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")throw new BrowserFetchError("PDF本文を確認できませんでした。アクセス制限の可能性があります。");
    const {getDocumentProxy}=await import("unpdf");
    const pdf=await getDocumentProxy(bytes,{maxImageSize:1_000_000,disableFontFace:true,useSystemFonts:false});
    try {
      // No page-count ceiling. Process one page at a time and release its
      // resources instead of extracting every page concurrently.
      const pages:string[]=[];let characters=0;
      for(let number=1;number<=pdf.numPages;number++){
        signal.throwIfAborted();
        const page=await pdf.getPage(number);
        try{
          const content=await page.getTextContent();
          const text=content.items.map(item=>"str" in item?item.str+(item.hasEOL?"\n":" "):"").join("");
          characters+=text.length;
          if(characters>1_500_000)throw new BrowserFetchError("PDFの本文量が処理上限を超えたため未確認です。原文をご確認ください。");
          pages.push(text);
        }finally{page.cleanup();}
      }
      const result={text:pages.join("\n")};
      if(result.text.trim().length<20)throw new BrowserFetchError("PDFの文字を確認できませんでした。画像のみの資料は原文で確認してください。");
      const links:OfficialPdfDocument["links"]=[];
      if(listing){
        // The two verified Ashiya indexes publish requests on page 1;
        // later pages contain award archives. Follow only published URI links.
        const page=await pdf.getPage(1),content=await page.getTextContent();
        for(const annotation of await page.getAnnotations()){
          const raw=annotation.url??annotation.unsafeUrl;
          if(typeof raw!=="string"||!raw)continue;
          const href=officialDefenseUrl(raw,current);
          if(!href||!new URL(href).pathname.startsWith("/asdf/")||!Array.isArray(annotation.rect))continue;
          const [x1,y1,x2,y2]=annotation.rect;
          const label=content.items.flatMap(item=>{
            if(!("str" in item))return [];
            const [,,,,x,y]=item.transform;
            return x>=x1-3&&x<=x2+3&&y>=y1-5&&y<=y2+5?[item.str]:[];
          }).join("").normalize("NFKC").trim();
          if(/入札書|見積書|市場価格|市価調査|同等品|委任状|実施要領|お知らせ|結果/.test(label))continue;
          if(!links.some(link=>link.url===href))links.push({url:href,title:label||"公告（一覧PDF内リンク）"});
        }
      }
      return {text:result.text,links};
    } finally { await pdf.loadingTask.destroy(); }
  }
  throw new BrowserFetchError("資料の移動回数が多いため未確認です。");
}
