import { z } from "zod";

export const statuses = ["new", "reviewing", "preparing", "submitted", "won", "lost", "passed", "completed"] as const;
export type BidStatus = typeof statuses[number];
export const statusLabels: Record<BidStatus, string> = { new: "未確認", reviewing: "参加検討", preparing: "提案・見積作成", submitted: "提出済", won: "受注", lost: "不採択", passed: "見送り", completed: "完了" };
export const activeStatuses: BidStatus[] = ["new", "reviewing", "preparing"];
export const submittedStatuses: BidStatus[] = ["submitted", "won", "lost", "completed"];
export const emptyBid = { title: "", agency: "", region: "", deadline: "", announcedOn: "", contractMethod: "", budget: "", qualifications: "", summary: "", matchReason: "", concerns: "", officialUrl: "", fit: "B" as const, status: "new" as BidStatus, assignee: "", notes: "", submittedOn: "", workflow: "{}" };
export function todayJst(date = new Date()) { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
export function dateOffset(day: string, offset: number) { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); }
export function weekStart(day: string) { const weekday = new Date(day + "T00:00:00Z").getUTCDay(); return dateOffset(day, -((weekday + 6) % 7)); }
export function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value; }
export function safePublicUrl(value: string) {
  try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password && !!u.hostname && u.hostname.includes("."); } catch { return false; }
}
export function canonicalUrl(value: string) { if (!value) return ""; const u = new URL(value); u.hash = ""; for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(k)) u.searchParams.delete(k); u.searchParams.sort(); return u.href.replace(/\/$/, ""); }
const text = (max: number) => z.string().trim().max(max);
const date = text(10).refine(v => !v || validDate(v), "正しい日付を入力してください");
export const bidSchema = z.object({
  title: text(250).min(1, "案件名を入力してください"), agency: text(200).min(1, "発注機関を入力してください"), region: text(150), deadline: date, announcedOn: date,
  contractMethod: text(150), budget: text(200), qualifications: text(2000), summary: text(6000), matchReason: text(2500), concerns: text(3000),
  officialUrl: text(2000).refine(v => !v || safePublicUrl(v), "公告URLはhttpまたはhttpsで入力してください"), fit: z.enum(["A", "B", "C"]), status: z.enum(statuses), assignee: text(250), notes: text(10000), submittedOn: date, workflow: text(30000).default("{}"),
}).refine(v => !submittedStatuses.includes(v.status) || !!v.submittedOn, { message: "提出済・受注・不採択・完了の案件には提出日を入力してください", path: ["submittedOn"] }).refine(v => !v.submittedOn || v.submittedOn <= todayJst(), { message: "提出日には本日以前の日付を入力してください", path: ["submittedOn"] });
export type BidInput = z.infer<typeof bidSchema>;
export type Bid = BidInput & { id: string; source: "manual" | "ai"; createdBy: string; createdAt: number; updatedAt: number; revision: number };
export type Member = { email: string; name: string; role: "owner" | "member" };
export type Session = { user: { id: string; name: string; email: string }; role: "owner" | "member" | "guest"; members: Member[]; membership: { allowed: boolean; kind: "owner" | "member" | null; loginId?: string } };
export type Dashboard = { active: number; dueSoon: number; weekly: number; monthly: number; deadlines: Bid[]; statusCounts: { status: BidStatus; count: number }[] };
export function displayDate(value: string) { return value ? value.replaceAll("-", "/") : "要確認"; }
export function deadlineText(value: string, today = todayJst()) { if (!value) return "締切未確認"; const diff = Math.round((Date.parse(value) - Date.parse(today)) / 86400000); return diff < 0 ? `${Math.abs(diff)}日超過` : diff === 0 ? "本日締切" : `あと${diff}日`; }
