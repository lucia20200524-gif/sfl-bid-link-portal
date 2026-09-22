import { authorizeDigest,discoveryDigest } from "@/lib/discovery-digest";
import { reply,failure } from "@/lib/server-store";
export async function POST(request:Request){
  try{await authorizeDigest(request);return reply(await discoveryDigest());}
  catch(error){return failure(error);}
}
