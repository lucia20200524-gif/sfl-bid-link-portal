import { requireAccountOwner } from "@/lib/member-auth";
import { checkMutation, failure, jsonBody, reply } from "@/lib/server-store";
import { saveTemplateUrl, templateUrl } from "@/lib/member-lark-store";
export async function POST(request: Request) {
  try { checkMutation(request); await requireAccountOwner(request); await saveTemplateUrl(await jsonBody(request)); return reply({ templateUrl: await templateUrl() }); }
  catch (error) { return failure(error); }
}
