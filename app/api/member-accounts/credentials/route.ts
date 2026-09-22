import { checkMutation, failure, jsonBody, reply } from "@/lib/server-store";
import { revealMemberCredential, requireAccountOwner } from "@/lib/member-auth";

export async function POST(request: Request) {
  try {
    checkMutation(request);
    await requireAccountOwner(request);
    return reply(await revealMemberCredential(request, await jsonBody(request)));
  } catch (error) { return failure(error); }
}
