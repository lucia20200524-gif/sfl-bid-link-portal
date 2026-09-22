import { requireSearchMember } from "@/lib/member-auth";
import { z } from "zod";
import {  reply, failure } from "@/lib/server-store";
import { discoveryFeed } from "@/lib/discovery-store";
import { advancedSearchSchema } from "@/lib/procurement-workbench";
import { todayJst } from "@/lib/bid-domain";
import { discoveryPageSize } from "@/lib/discovery-domain";

const query = z.object({
  mode: z.enum(["sfl", "engineer", "academy"]).default("sfl"),
  source: z.enum(["all", "kkj", "mod", "gsdf", "msdf", "asdf"]).default("all"),
  view: z.enum(["all", "soon", "new", "attention"]).default("all"),
  sort: z.enum(["deadline", "newest"]).default("deadline"),
  offset: z.coerce.number().int().min(0).max(20000).default(0),
});

export async function GET(request: Request) {
  try {
    const actor = await requireSearchMember(request);
    const p = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const today = todayJst();
    const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
    // The feature covers all stored work types, independent of each mode's
    // default keywords. Category, future deadlines and D/D/C stay enforced.
    return reply(await discoveryFeed(actor, {
      mode: p.mode, source: p.source, category: "open-counter", allKeywords: true,
      bucket: p.view === "attention" ? "attention" : "all", keywords: [], exclude: [],
      offset: p.offset, pageSize: discoveryPageSize, newOnly: p.view === "new",
      filters: advancedSearchSchema.parse({ period: "future", sort: p.sort,
        ...(p.view === "soon" ? { deadlineTo: weekEnd } : {}) }),
    }));
  } catch (error) { return failure(error); }
}
