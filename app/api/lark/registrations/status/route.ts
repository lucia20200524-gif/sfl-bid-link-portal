import { requireSearchMember } from "@/lib/member-auth";
import { z } from "zod";
import { checkMutation, failure, jsonBody, reply } from "@/lib/server-store";
import { larkModeSchema } from "@/lib/lark-registration";
import { registrationStatuses } from "@/lib/lark-store";

const schema = z.object({ mode: larkModeSchema, keys: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(100) });
export async function POST(request: Request) {
  try {
    checkMutation(request); const actor = await requireSearchMember(request);
    const { mode, keys } = schema.parse(await jsonBody(request));
    return reply(await registrationStatuses(mode, [...new Set(keys)], actor));
  } catch (error) { return failure(error); }
}
