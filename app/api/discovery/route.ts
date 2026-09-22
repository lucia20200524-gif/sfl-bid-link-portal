import { requireSearchMember } from "@/lib/member-auth";
import { advancedSearchSchema } from "@/lib/procurement-workbench";
import { z } from "zod";
import { ApiError,checkMutation,jsonBody,reply,failure } from "@/lib/server-store";
import { discoveryFeed,setDiscoveryReview,confirmDiscoveryDeadline } from "@/lib/discovery-store";
import { collectionProgress,startInspection,inspectionIds,stepCollection,pauseInspection } from "@/lib/discovery-collector";
import { expandedKeywords } from "@/lib/procurement-synonyms";
import { discoveryTerms, discoveryPageSize, splitKeywords } from "@/lib/discovery-domain";
const mode=z.enum(["sfl","engineer","academy","free"]);
const query=z.object({mode:mode.default("sfl"),larkMode:z.enum(["sfl","engineer","academy","free"]).optional(),source:z.enum(["all","kkj","p-portal","mod","gsdf","msdf","asdf"]).default("all"),bucket:z.enum(["all","recommended","related","attention","reviewed"]).optional(),category:z.enum(["all","open-counter","unified-required","municipal"]).default("all"),keywords:z.string().max(4000).default(""),exclude:z.string().max(1000).default(""),candidateLimit:z.coerce.number().int().min(100).max(20100).default(100),runId:z.string().uuid().optional(),itemId:z.string().regex(/^[a-f0-9]{64}$/).optional(),includePool:z.enum(["0","1"]).default("0"),offset:z.coerce.number().int().min(0).max(20000).default(0),newOnly:z.enum(["0","1"]).default("0")});
const runKey=(actorId:string,mode:string)=>`manual:${actorId}:${mode}`;
export async function GET(request:Request){try{
  const started=performance.now();
  const actor=await requireSearchMember(request),raw=Object.fromEntries(new URL(request.url).searchParams),p=query.parse(raw),filters=advancedSearchSchema.parse(raw);
  if(p.itemId&&p.runId)throw new ApiError(400,"取得する案件の指定を確認してください。");
  const key=runKey(actor.id,p.mode),candidateIds=p.itemId?[p.itemId]:p.runId?await inspectionIds(key,p.runId):undefined;
  const [feed,progress]=await Promise.all([
    discoveryFeed(actor,{...p,candidateIds,includePool:p.includePool==="1",bucket:p.bucket??(p.mode==="free"?"all":"recommended"),pageSize:discoveryPageSize,filters,keywords:splitKeywords(p.keywords),exclude:splitKeywords(p.exclude),newOnly:p.newOnly==="1"}),
    // Ordinary saved searches never deserialize the external crawler's queue.
    p.runId?collectionProgress(key):Promise.resolve({status:"saved",processed:0,pending:0,saved:0,message:"",sources:[]}),
  ]);
  const response=reply({...feed,progress});
  response.headers.set("Server-Timing",`saved-search;dur=${(performance.now()-started).toFixed(1)}`);
  return response;
}catch(e){return failure(e);}}
// Legacy clients may send a candidate target; it never controls collection.
const batchSchema=z.object({search:z.string().max(60000),target:z.number().optional()});
const mutation=z.discriminatedUnion("action",[
  z.object({action:z.literal("start"),mode:mode.default("sfl"),source:z.enum(["all","kkj","mod","gsdf","msdf","asdf"]).default("all"),keywords:z.string().max(4000).default(""),synonyms:z.enum(["on","off"]).default("on"),batch:batchSchema.optional()}),
  z.object({action:z.literal("step"),mode:mode.default("sfl"),runId:z.string().uuid()}),z.object({action:z.literal("pause"),mode:mode.default("sfl"),runId:z.string().uuid()}),
  z.object({action:z.literal("review"),mode,id:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(["new","reviewed","dismissed"]),reason:z.string().max(300).default("")}),
  z.object({action:z.literal("confirm-deadline"),mode,id:z.string().regex(/^[a-f0-9]{64}$/),deadline:z.string().max(10),evidence:z.string().trim().min(5,"公式公告の記載を入力してください。").max(500)}),
]);
export async function POST(request:Request){try{checkMutation(request);const actor=await requireSearchMember(request),p=mutation.parse(await jsonBody(request));
  const key=runKey(actor.id,p.mode);
  if(p.action==="start") {
    const terms=splitKeywords(p.keywords);if(p.mode==="free"&&!terms.length)throw new ApiError(400,"探したい仕事や物品名を入力してください。");
    const requested=expandedKeywords(terms.length?terms:discoveryTerms[p.mode],p.synonyms!=="off");
    const signature=JSON.stringify({mode:p.mode,source:p.source,terms:requested,search:p.batch?.search??""});
    const runId=await startInspection(key,signature,requested,p.source,p.mode);
    return reply({runId,progress:await collectionProgress(key)});
  }
  if(p.action==="step"){
    try {await stepCollection(key,p.runId);}
    catch(e){
      if(e instanceof ApiError&&e.code==="collection_busy")return reply({progress:await collectionProgress(key),waiting:true,message:e.message},202);
      throw e;
    }
  }
  if(p.action==="pause")await pauseInspection(key,p.runId);
  if(p.action==="review")await setDiscoveryReview(actor,p.mode,p.id,p.state,p.reason);
  if(p.action==="confirm-deadline")await confirmDiscoveryDeadline(actor,p.mode,p.id,p.deadline,p.evidence);
  return reply({progress:await collectionProgress(key)});
}catch(e){return failure(e);}}
