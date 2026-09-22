import { requireSearchMember } from "@/lib/member-auth";
import { z } from "zod";
import {  checkMutation, jsonBody, reply, failure, db, ApiError } from "@/lib/server-store";
import { readCompanyProfile, savedSearchSchema } from "@/lib/procurement-workbench";
import { discoveryHistory } from "@/lib/discovery-store";
import { isProcurementSourceId } from "@/lib/procurement-sources";

export async function GET(request:Request){try{
  const actor=await requireSearchMember(request),params=new URL(request.url).searchParams;
  if(params.get("history")){
    const id=z.string().regex(/^[a-f0-9]{64}$/).parse(params.get("history"));
    return reply({history:await discoveryHistory(id)});
  }
  const profile=await db().prepare("SELECT profile FROM procurement_preferences WHERE user_id=?").bind(actor.id).first<{profile:string}>();
  const searches=await db().prepare("SELECT id,data,updated_at FROM saved_procurement_searches WHERE user_id=? ORDER BY updated_at DESC LIMIT 30").bind(actor.id).all<{id:string;data:string;updated_at:number}>();
  const corpus=await db().prepare("SELECT COUNT(*) AS total,COUNT(DISTINCT json_extract(data,'$.agency')) AS agencies,MAX(last_seen) AS lastSeen,SUM(CASE WHEN deadline='' THEN 1 ELSE 0 END) AS unknown FROM discovery_candidates").first();
  return reply({profile:readCompanyProfile(profile?.profile),searches:(searches.results as {id:string;data:string;updated_at:number}[]).map(v=>{
    const saved=JSON.parse(v.data);
    // Removed providers must not be restored by an old saved condition.
    // Keep its keywords and filters usable against the remaining sources.
    return {...saved,source:saved.source==="all"||isProcurementSourceId(saved.source)?saved.source:"all",id:v.id,updatedAt:v.updated_at};
  }),corpus});
}catch(e){return failure(e);}}
const action=z.discriminatedUnion("action",[
  z.object({action:z.literal("profile")}),
  z.object({action:z.literal("save-search"),search:savedSearchSchema}),
  z.object({action:z.literal("delete-search"),id:z.string().uuid()}),
]);
export async function POST(request:Request){try{
  checkMutation(request);const actor=await requireSearchMember(request),input=action.parse(await jsonBody(request));
  if(input.action==="profile")throw new ApiError(403,"参加資格は固定されています。この画面からは変更できません。","qualification_locked");
  if(input.action==="save-search"){
    const count=await db().prepare("SELECT COUNT(*) AS n FROM saved_procurement_searches WHERE user_id=?").bind(actor.id).first<{n:number}>();
    if((count?.n??0)>=30)throw new ApiError(400,"検索条件は30件まで保存できます。不要な条件を削除してください。");
    await db().prepare("INSERT INTO saved_procurement_searches (id,user_id,data,updated_at) VALUES (?,?,?,?)").bind(crypto.randomUUID(),actor.id,JSON.stringify(input.search),Date.now()).run();
  }
  if(input.action==="delete-search")await db().prepare("DELETE FROM saved_procurement_searches WHERE id=? AND user_id=?").bind(input.id,actor.id).run();
  return reply({saved:true});
}catch(e){return failure(e);}}
