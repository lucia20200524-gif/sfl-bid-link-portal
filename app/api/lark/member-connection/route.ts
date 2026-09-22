import { z } from "zod";
import { requireSearchMember } from "@/lib/member-auth";
import { checkMutation, failure, jsonBody, reply } from "@/lib/server-store";
import { connectionSubject, disconnectMemberLark, memberLarkSettings, saveMemberLark } from "@/lib/member-lark-store";
async function subject(request: Request) {
  return connectionSubject(await requireSearchMember(request), new URL(request.url).searchParams.get("accountId"));
}
export async function GET(request: Request) {
  try { return reply(await memberLarkSettings(await subject(request))); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { checkMutation(request); const actor = await subject(request); return reply(await saveMemberLark(actor, await jsonBody(request))); } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try {
    checkMutation(request); const actor = await subject(request);
    const { revision } = z.object({ revision: z.string().uuid() }).parse(await jsonBody(request));
    await disconnectMemberLark(actor, revision); return reply(await memberLarkSettings(actor));
  } catch (error) { return failure(error); }
}
