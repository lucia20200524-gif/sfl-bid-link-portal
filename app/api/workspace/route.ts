import { failure, reply } from "@/lib/server-store";
import { workspaceSession } from "@/lib/member-auth";
export async function GET(request: Request) { try { return reply(await workspaceSession(request)); } catch(error) { return failure(error); } }
