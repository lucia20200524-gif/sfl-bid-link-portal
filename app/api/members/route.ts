import { z } from "zod";
import { ApiError, checkMutation, db, failure, jsonBody, listMembers, reply, requireMember } from "@/lib/server-store";
export async function POST(request: Request) {try{
 checkMutation(request);const actor=await requireMember(request);if(actor.role!=="owner")throw new ApiError(403,"メンバー登録は管理者のみ操作できます。");
 const input=z.object({email:z.string().trim().email().max(250).transform(s=>s.toLowerCase()),name:z.string().trim().min(1).max(100)}).parse(await jsonBody(request));
 await db().prepare("INSERT INTO bid_members (email,name,role,created_at) VALUES (?,?,'member',?) ON CONFLICT(email) DO UPDATE SET name=excluded.name").bind(input.email,input.name,Date.now()).run();return reply({members:await listMembers()});
}catch(e){return failure(e);}}
export async function DELETE(request: Request) {try{
 checkMutation(request);const actor=await requireMember(request);if(actor.role!=="owner")throw new ApiError(403,"メンバー解除は管理者のみ操作できます。");
 const {email}=z.object({email:z.string().email().transform(s=>s.toLowerCase())}).parse(await jsonBody(request));if(email===actor.email)throw new ApiError(400,"管理者は解除できません。");
 await db().prepare("DELETE FROM bid_members WHERE email=? AND role!='owner'").bind(email).run();return reply({members:await listMembers()});
}catch(e){return failure(e);}}
