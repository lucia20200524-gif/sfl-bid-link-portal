import { requireSearchMember } from "@/lib/member-auth";
import { z } from "zod";
import { checkMutation, failure, jsonBody, reply } from "@/lib/server-store";
import { larkCandidateSchema, larkModeSchema } from "@/lib/lark-registration";
import { registerInLark } from "@/lib/lark-store";

const schema = z.object({ mode: larkModeSchema, item: larkCandidateSchema, destinationRevision: z.string().max(100).optional() });
export async function POST(request: Request) {
  try {
    checkMutation(request);
    const actor = await requireSearchMember(request);
    const { mode, item, destinationRevision } = schema.parse(await jsonBody(request));
    return reply(await registerInLark(mode, item, actor, destinationRevision));
  } catch (error) { return failure(error); }
}
