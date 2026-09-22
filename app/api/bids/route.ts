import { requireSearchMember } from "@/lib/member-auth";
import { bidFilter } from "@/lib/bid-filters";
import { type Bid } from "@/lib/bid-domain";
import { checkMutation, columns, db, failure, jsonBody, reply,  saveBid } from "@/lib/server-store";
export async function GET(request: Request) {
 try {
  await requireSearchMember(request);const q=new URL(request.url).searchParams;
  const offset=Math.max(0,Math.min(100000,Math.floor(Number(q.get("offset")))||0));
  const {condition,args}=bidFilter(q);
  const results=await db().batch([db().prepare(`SELECT ${columns} FROM bids WHERE ${condition} ORDER BY CASE WHEN deadline='' THEN 1 ELSE 0 END, deadline ASC, created_at DESC LIMIT 50 OFFSET ?`).bind(...args,offset),db().prepare(`SELECT COUNT(*) AS total FROM bids WHERE ${condition}`).bind(...args)]);
  return reply({items:results[0].results as unknown as Bid[],total:(results[1].results[0] as {total:number}).total,offset});
 }catch(e){return failure(e);}
}
export async function POST(request: Request) {try{checkMutation(request);const actor=await requireSearchMember(request);return reply({bid:await saveBid(await jsonBody(request),actor)},201);}catch(e){return failure(e);}}
