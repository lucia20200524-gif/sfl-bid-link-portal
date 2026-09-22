import { dateOffset, statuses, todayJst } from "./bid-domain";

export function bidFilter(params: URLSearchParams, today = todayJst()) {
  const where: string[] = ["1=1"];
  const args: (string | number)[] = [];
  const search = (params.get("q") ?? "").trim().slice(0, 200);
  const status = params.get("status");
  const assignee = (params.get("assignee") ?? "").slice(0, 250);
  const deadline = params.get("deadline");
  if (search) {
    where.push("(title LIKE ? ESCAPE '\\' OR agency LIKE ? ESCAPE '\\' OR region LIKE ? ESCAPE '\\')");
    const term = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
    args.push(term, term, term);
  }
  if (status === "active") where.push("status IN ('new','reviewing','preparing')");
  else if (status && statuses.includes(status as typeof statuses[number])) { where.push("status=?"); args.push(status); }
  if (assignee) { where.push("assignee=?"); args.push(assignee); }
  if (deadline === "soon") { where.push("deadline >= ? AND deadline <= ?"); args.push(today, dateOffset(today, 7)); }
  if (deadline === "overdue") { where.push("deadline != '' AND deadline < ?"); args.push(today); }
  if (deadline === "unknown") where.push("deadline = ''");
  return { condition: where.join(" AND "), args };
}
