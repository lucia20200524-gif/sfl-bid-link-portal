import { z } from "zod";
import type { LarkMode, PresetMode } from "./collection-profiles";
import { larkWikiToken, larkMemberTemplateUrl } from "./lark-registration";

export const presetLarkModes: PresetMode[] = ["sfl", "engineer", "academy"];
export const larkModes: LarkMode[] = [...presetLarkModes, "free"];
export type LarkDestination = { name: string; tableId: string; url: string };
export type LarkDestinations = Record<PresetMode, LarkDestination> & Partial<Record<"free", LarkDestination>>;
export type MemberLarkSettings = {
  configured: boolean; owner: boolean; revision: string; templateUrl: string;
  appId?: string; targets?: LarkDestinations; checkedAt?: number; savedBaseUrl?: string;
};
// Only parse links. Every outbound request still uses the fixed Lark API origin.
export function parseLarkBaseUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("LarkのBaseを開き、ブラウザのURLを貼り付けてください。"); }
  if (url.protocol !== "https:" || !/^[a-z0-9-]+(?:\.jp)?\.larksuite\.com$/.test(url.hostname) || url.port || url.username || url.password) throw new Error("LarkのBase内でコピーしたURLを入力してください。");
  const match = url.pathname.match(/^\/(base|wiki)\/([a-zA-Z0-9]+)\/?$/);
  if (!match) throw new Error("LarkのBaseを開き、ブラウザのURLを貼り付けてください。");
  if (match[2] === larkWikiToken) throw new Error("SFLの運用中のBaseは指定できません。ご自身のLarkへ複製したBaseを指定してください。");
  if (match[2] === new URL(larkMemberTemplateUrl).pathname.split("/").pop()) throw new Error("テンプレートそのものには登録できません。ご自身のLarkへ複製し、複製先のURLを指定してください。");
  return { kind: match[1] as "base" | "wiki", token: match[2], baseUrl: url.origin + url.pathname.replace(/\/$/, "") };
}
export const memberBaseUrlInput = z.string().trim().max(2000).default("").transform((value, ctx) => {
  if (!value) return "";
  try { return parseLarkBaseUrl(value).baseUrl; }
  catch (error) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "LarkのURLを確認してください。" }); return z.NEVER; }
});
export function parseLarkTableUrl(value: string) {
  const base = parseLarkBaseUrl(value);
  const url = new URL(value);
  const tableId = url.searchParams.get("table");
  if (!tableId || !/^tbl[a-zA-Z0-9]+$/.test(tableId)) throw new Error("登録先のテーブルを開き、table= を含むURLをコピーしてください。");
  return { ...base, tableId, url: `${base.baseUrl}?table=${tableId}` };
}
const tableUrl = z.string().trim().max(2000).transform((value, ctx) => {
  try { return parseLarkTableUrl(value); }
  catch (error) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "LarkのURLを確認してください。" }); return z.NEVER; }
});
export const memberConnectionInput = z.object({
  revision: z.string().max(100),
  appId: z.string().trim().regex(/^cli_[a-zA-Z0-9]+$/, "LarkアプリのApp IDを確認してください。"),
  appSecret: z.string().trim().min(8, "LarkアプリのApp Secretを入力してください。").max(300).optional(),
  urls: z.object({ sfl: tableUrl, engineer: tableUrl, academy: tableUrl, free: z.preprocess(value => value === "" ? undefined : value, tableUrl.optional()) }),
}).superRefine((value, ctx) => {
  const targets = larkModes.flatMap(mode => value.urls[mode] ? [value.urls[mode]!] : []);
  if (targets.some(target => target.baseUrl !== targets[0].baseUrl)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "登録先のテーブルは、同じ複製先Baseから選んでください。" });
  if (new Set(targets.map(target => target.tableId)).size !== targets.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "各モードに対応する異なるテーブルを指定してください。" });
});
export function destinationRecordUrl(destination: LarkDestination, recordId?: string) {
  const url = new URL(destination.url);
  if (recordId && /^rec[a-zA-Z0-9]+$/.test(recordId)) url.searchParams.set("record", recordId);
  return url.href;
}
