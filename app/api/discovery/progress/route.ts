import { requireSearchMember } from "@/lib/member-auth";
import {  reply, failure } from "@/lib/server-store";
import { collectionProgress } from "@/lib/discovery-collector";

// The status page only needs the collector snapshot, not a search of saved notices.
export async function GET(request: Request) {
  try {
    await requireSearchMember(request);
    return reply({ progress: await collectionProgress() });
  } catch (error) {
    return failure(error);
  }
}
