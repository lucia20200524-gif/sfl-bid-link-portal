import { z } from "zod";
import { canonicalUrl, safePublicUrl, validDate } from "./bid-domain";
import type { LarkMode, PresetMode } from "./collection-profiles";

export const larkBaseUrl = "https://bjp66vk3my8x.jp.larksuite.com/wiki/EvGnwALQmi1uRLkhTjNjx5N0pJh";
export const larkWikiToken = "EvGnwALQmi1uRLkhTjNjx5N0pJh";
// Empty member template verified in Lark; members connect their own copies.
export const larkMemberTemplateUrl = "https://bjp66vk3my8x.jp.larksuite.com/base/OtpvbyV9XawcGqsEUbCjsNekpdd";
// These are the three existing destination tables, verified in the user's Base.
// Never accept a destination, arbitrary fields, or an API URL from the browser.
export const larkTargets = {
  sfl: { name: "SFL専用【案件管理】", tableId: "tblIHEsNQqagkYqH", viewId: "vew3Yiwrz5" },
  engineer: { name: "エンジニア専用【案件管理】", tableId: "tblvSax8yNyeZoMv", viewId: "vew3Yiwrz5" },
  academy: { name: "一般用【Academy専用】", tableId: "tblruF7Nc862pCWC", viewId: "vewGeRkeow" },
} as const satisfies Record<PresetMode, { name: string; tableId: string; viewId: string }>;
export const larkTargetNames: Record<LarkMode, string> = { sfl: larkTargets.sfl.name, engineer: larkTargets.engineer.name, academy: larkTargets.academy.name, free: "フリーモード【案件管理】" };
export const larkModeSchema = z.enum(["sfl", "engineer", "academy", "free"]);
const shortText = (max: number) => z.string().trim().max(max);
export const larkIdentitySchema = z.object({
  title: shortText(250).min(1, "案件名がありません。再検索してください。"),
  agency: shortText(200),
  officialUrl: shortText(2000).refine(safePublicUrl, "公告URLを確認してください。"),
});
export const larkCandidateSchema = larkIdentitySchema.extend({
  prefecture: shortText(100).optional(),
  deadline: shortText(10).refine(validDate, "提出期限を確認してください。"),
  classification: z.object({ openCounterEvidence: shortText(1000).optional(), unifiedRequiredEvidence: shortText(1000).optional() }).optional(),
});
export type LarkCandidate = z.infer<typeof larkCandidateSchema>;
export type LarkIdentity = z.infer<typeof larkIdentitySchema>;
export const normalizeLarkText = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
export function larkCandidateIdentity(item: LarkIdentity) {
  return JSON.stringify([canonicalUrl(item.officialUrl), normalizeLarkText(item.title), normalizeLarkText(item.agency)]);
}
export async function larkRegistrationKey(mode: LarkMode, item: LarkIdentity) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${larkWikiToken}|${mode === "free" ? "free" : larkTargets[mode].tableId}|${larkCandidateIdentity(item)}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export function larkTableUrl(mode: PresetMode, recordId?: string) {
  const target = larkTargets[mode], url = new URL(larkBaseUrl);
  url.searchParams.set("table", target.tableId);
  url.searchParams.set("view", target.viewId);
  if (recordId && /^rec[a-zA-Z0-9]+$/.test(recordId)) url.searchParams.set("record", recordId);
  return url.href;
}
export type LarkRegistrationState = { state: "registered" | "checking"; recordUrl?: string; warnings?: string[] };
export type LarkRegistrationStatus = { configured: boolean; message?: string; registrations: Record<string, LarkRegistrationState>; destination?: import("./lark-destination").LarkDestination; destinationRevision?: string };
export type LarkRegistrationResult = { registered: true; alreadyRegistered: boolean; recordUrl: string; targetName: string; warnings: string[] };
