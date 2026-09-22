import { requireSearchMember } from "@/lib/member-auth";
import { dashboardData, failure, reply } from "@/lib/server-store";
export async function GET(request: Request) {try{await requireSearchMember(request);return reply(await dashboardData());}catch(e){return failure(e);}}
