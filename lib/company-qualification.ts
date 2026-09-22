export const qualificationPreset = "sfl-ddc-2026-09" as const;
export const defaultQualificationGrades = { goodsGrade: "D", serviceGrade: "D", purchaseGrade: "C" } as const;
export const qualificationCategories = [
  { key: "goodsGrade", label: "物品の販売" },
  { key: "serviceGrade", label: "役務の提供等" },
  { key: "purchaseGrade", label: "物品の買受け" },
] as const;
type Grades = Record<typeof qualificationCategories[number]["key"], string>;

export function qualificationSummary(profile: Grades) {
  return qualificationCategories.map(c => `${c.label}：${profile[c.key] ? `等級${profile[c.key]}` : "未登録・未取得"}`).join(" ／ ");
}

/** Only exclude a definite grade mismatch in a single, unambiguous category.
 * Multiple categories, exceptions and grade ranges require reading the original.
 * Never borrow the grade of goods sales for purchases, or infer eligibility by rank.
 */
export function compareQualificationGrades(evidence: string, profile: Grades): { state: "match" | "mismatch" | "unknown"; detail: string } {
  const normalized = evidence.normalize("NFKC").replace(/\s+/g, "");
  const mentions = [...normalized.matchAll(/物品の販売|役務の提供(?:等)?|物品の買受(?:け)?|物品の製造/g)];
  const fallback = { state: "unknown" as const, detail: `登録条件：${qualificationSummary(profile)}。資格区分と対象等級を原文で確認してください。` };
  if (mentions.length !== 1) return fallback;
  const mention = mentions[0];
  const category = qualificationCategories.find(c => c.label.startsWith(mention[0]));
  if (!category) return fallback;
  const own = profile[category.key];
  // Conditional acceptance and exceptions must not become automatic exclusions.
  if (!own || /ただし|但し|かかわらず|関わらず|問わ|下位|上位|同等|認め|みなし|参加でき|参加可能|資格を要しない/.test(normalized)) return fallback;
  const clause = normalized.slice(mention.index! + mention[0].length).split(/[。；;]/)[0].slice(0, 180);
  const gradeClauses = [...clause.matchAll(/[「『"']?[A-D][」』"']?(?:[、,・及び又は若しくはまたはもしくは「」『』"'A-D等級のから~〜～-]){0,60}(?:等級|級)/g)];
  // Notices also list quoted grades directly after the category, without "等級".
  // Anchor the whole list to that category; never treat a later unrelated A–D as a grade.
  const quotedList = clause.match(/^[」』"']?(?:の|で|において)?([「『"'][A-D][」』"'](?:(?:[、,・]|又は|または|若しくは|もしくは|及び|および)+[「『"'][A-D][」』"'])*)(?=$|(?:の)?(?:等級|級)|に格付|である|の資格)/)?.[1];
  const gradeClause = gradeClauses.length === 1 ? gradeClauses[0][0] : gradeClauses.length === 0 ? quotedList : undefined;
  if (!gradeClause || /から|[~〜～-]|以上|以下/.test(clause)) return fallback;
  const grades = [...new Set(gradeClause.match(/[A-D]/g) ?? [])];
  if (!grades.length) return fallback;
  return { state: grades.includes(own) ? "match" : "mismatch", detail: `${category.label}：登録等級${own} ／ 公告の対象等級 ${grades.join("・")}。地域・営業品目・有効期間なども原文で確認してください。` };
}
