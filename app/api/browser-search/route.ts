import { requireSearchMember } from "@/lib/member-auth";
import { ApiError,checkMutation,failure,jsonBody,reply } from "@/lib/server-store";
import { browserConfiguration,fetchBrowserHtml,fetchOfficialPdf } from "@/lib/defense-browser-client";
import { isDefenseBrowserSource,defenseBrowserUnavailable } from "@/lib/defense-browser-rules";
import { advanceBrowserJob,browserJobView,newBrowserJob } from "@/lib/defense-browser-engine";
import { cancelBrowserJob,claimBrowserJob,commitBrowserJob,getBrowserJob,latestBrowserJob,saveNewBrowserJob } from "@/lib/defense-browser-store";
import { searchModes, type CollectionMode } from "@/lib/collection-profiles";

export async function GET(request:Request){
  try{
    const actor=await requireSearchMember(request);
    const config=browserConfiguration();
    const params=new URL(request.url).searchParams;
    if(!params.has("mode"))return reply(config);
    const mode=params.get("mode")??"",source=params.get("sourceId")??"";
    if(!searchModes.some(m=>m.id===mode)||!isDefenseBrowserSource(source))throw new ApiError(400,"検索タブと検索先を確認してください。");
    const job=await latestBrowserJob(actor,mode,source);
    return reply({...config,job:job?browserJobView(job):null});
  }catch(error){return failure(error);}
}

export async function POST(request:Request){
  try{
    checkMutation(request);const actor=await requireSearchMember(request);const body=await jsonBody(request);
    if(["cancel","pause"].includes(body?.action)){
      if(typeof body.id!=="string"||body.id.length>100)throw new ApiError(400,"検索情報を確認してください。");
      return reply(browserJobView(await cancelBrowserJob(actor,body.id,body.action==="pause")));
    }
    if(!browserConfiguration().configured)throw new ApiError(503,defenseBrowserUnavailable,"browser_not_connected");
    if(body?.action==="start"){
      if(!searchModes.some(m=>m.id===body.mode)||!isDefenseBrowserSource(body.sourceId))throw new ApiError(400,"検索タブと検索先を確認してください。");
      if(typeof body.keywords!=="string"||body.keywords.length>1000)throw new ApiError(400,"キーワードは1,000文字以内で入力してください。");
      const keywords=[...new Set<string>(body.keywords.split(/[、,\s]+/).filter((v:string)=>v.length>=2))];
      if(!keywords.length||keywords.length>50)throw new ApiError(400,"2文字以上のキーワードを50語以内で入力してください。");
      if(!["title","fulltext"].includes(body.scope))throw new ApiError(400,"検索範囲を確認してください。");
      const job=newBrowserJob(body.mode as CollectionMode,body.sourceId,keywords,body.scope);
      await saveNewBrowserJob(actor,job);return reply(browserJobView(job));
    }
    if(!["step","resume"].includes(body?.action)||typeof body.id!=="string"||body.id.length>100)throw new ApiError(400,"検索操作を確認してください。");
    const claim=await claimBrowserJob(actor,body.id);
    if(!claim)return reply(browserJobView(await getBrowserJob(actor,body.id)));
    const {job,token}=claim;
    try{
      if(body.action==="resume"&&job.status==="paused")job.status="running";
      await advanceBrowserJob(job,{html:(url:string)=>fetchBrowserHtml(url),pdf:fetchOfficialPdf});
      await commitBrowserJob(actor,job,token);
    }catch{
      job.status="paused";job.message="処理を一時停止しました。保存済みの進捗から再開できます。";
      await commitBrowserJob(actor,job,token);
    }
    return reply(browserJobView(await getBrowserJob(actor,body.id)));
  }catch(error){return failure(error);}
}
