import type { CollectionMode } from "./collection-profiles";
import type { DefenseSourceId } from "./defense-browser-rules";
import type { ProcurementCandidate, ProcurementResult, SearchScope } from "./procurement-search";
import type { OfficialNotice } from "./defense-browser-parser";

export const browserLimits = { pages: 1981, pagesPerTarget: 60, depth: 8, queued: 600, results: 100 } as const;
export type BrowserPage = { url: string; target: number; depth: number; kind: "root" | "navigation" | "notice"; priority?:number; title?: string; agency?: string; parentUrl?: string; repair?: {url:string;title:string}; repairOf?:string; listingEvidence?: OfficialNotice };
export type BrowserPageIssue = {url:string;title:string;target:number;message:string;status?:number;parentUrl?:string;resolvedUrl?:string};
export type BrowserTarget = { name: string; url?: string; visited: number; errors: number; limited: boolean; missing: boolean; notes: string[]; listingUrls?: string[]; noticesFound?: boolean; lastAttemptAt?:number; lastSuccessAt?:number };
export type BrowserJob = {
  id: string; mode: CollectionMode; sourceId: DefenseSourceId; keywords: string[]; scope: SearchScope;
  searchedOn: string; startedAt: string; updatedAt: string; status: "running" | "completed" | "cancelled" | "paused";
  queue: BrowserPage[]; seen: string[]; targets: BrowserTarget[]; items: ProcurementCandidate[];
  visited: number; lastTarget: number; limited: boolean; message: string;
  deadlineStats: { future: number; closed: number; unknown: number }; inspected: number;
  retainUnknown?: boolean;
  deferredNotices?: {notice:OfficialNotice;target:number;agency:string;retrievalIssue?:{message:string;attemptedAt:number};sourceUrl?:string}[];
  pageIssues?: BrowserPageIssue[];
  catalogRevision?: string;
  traversalRevision?:string;
  pdfPageLimitRemoved?:boolean;
};
export type BrowserProgress = {
  id: string; status: BrowserJob["status"]; mode: CollectionMode; sourceId: DefenseSourceId;
  visited: number; queued: number; limit: number; limited: boolean; message: string;
  targets: (BrowserTarget & { pending: number; state: "pending" | "checked" | "partial" | "failed" })[];
};
export type BrowserJobView = { progress: BrowserProgress; result: ProcurementResult };
