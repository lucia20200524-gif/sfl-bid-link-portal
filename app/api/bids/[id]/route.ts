import { requireSearchMember } from "@/lib/member-auth";
import { z } from "zod";
import { ApiError, findBid, checkMutation, failure, jsonBody, reply,  saveBid } from "@/lib/server-store";
export async function PATCH(request: Request, context: {params: Promise<{id:string}>}) {try{checkMutation(request);const actor=await requireSearchMember(request);const data=await jsonBody(request);const revision=z.number().int().positive().parse(data.revision);const {id}=await context.params;return reply({bid:await saveBid(data,actor,{id,revision})});}catch(e){return failure(e);}}

export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{await requireSearchMember(request);const {id}=await context.params;const bid=await findBid(id);if(!bid)throw new ApiError(404,"案件が見つかりません。");return reply({bid});}catch(e){return failure(e);}}
