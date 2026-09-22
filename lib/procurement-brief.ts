import type { DiscoveryItem } from "./discovery-domain";

export type BriefField = { label: string; value: string; evidence?: string; unknown?: boolean };

function workExcerpt(text: string): { value: string; evidence: string } | undefined {
  const headings = /(?:業務内容|業務概要|作業内容|調達(?:内容|概要)|仕様概要)(?::[ \t]*|[ \t]+|\n+)/g;
  const nextFields = "件名|履行(?:期間|場所|期限)|納(?:入|品)(?:期限|場所)|契約(?:期間|方法)|入札(?:方法|日時)|提出(?:期限|方法)|(?:競争)?参加資格|問(?:い)?合(?:わ)?せ先|担当部局";
  const sectionEnd = new RegExp(`(?:\\s*\\(\\s*\\d+\\s*\\)\\s*|\\n\\s*(?:\\d+[.、]?\\s*)?)(?:${nextFields})|[ \\t]+(?:${nextFields})\\s*:`);
  for (const heading of text.matchAll(headings)) {
    const prefix = text.slice(0, heading.index);
    // Only use section headings, not references to work in a contact paragraph.
    if (!/(?:^|[\n。；;])\s*(?:\d+[.、]?\s*)?$/.test(prefix) && !/\(\s*\d+\s*\)\s*$/.test(prefix)) continue;
    const tail = text.slice(heading.index + heading[0].length);
    const end = tail.search(sectionEnd);
    const excerpt = (end < 0 ? tail : tail.slice(0, end)).trim();
    const value = excerpt.replace(/\s+/g, " ");
    // Keep complete short sections. Ambiguous/long passages fall back to the title.
    if (value && value.length <= 260) return { value, evidence: `${heading[0]}${excerpt}`.trim() };
  }
}

// Extract labelled passages, not inferred requirements or generated claims.
// A whole submission clause is kept so prohibitions remain visible.
export function procurementBrief(item: DiscoveryItem): BriefField[] {
  const text = (item.descriptionText || "").normalize("NFKC");
  const clauses = text.split(/(?<=[。；;])|\n+/).map(s => s.trim()).filter(Boolean);
  const passage = (pattern: RegExp, max = 260) => clauses.find(s => s.length <= max && pattern.test(s));
  const work = workExcerpt(text);
  const methodIndex = clauses.findIndex(clause => {
    if (clause.length > 500) return false;
    const start = clause.search(/(?:(?:入札書|見積書|提案書)(?:の)?(?:提出|送付)(?:方法)?|提出方法)/);
    if (start < 0) return false;
    const tail = clause.slice(start), methodAt = tail.search(/持参|郵送|電子(?:メール|入札|調達)|メール|FAX|ファクシミリ|システム/i);
    // A questions/contact address following a deadline isn't a submission method.
    return methodAt >= 0 && !/質問|問(?:い)?合(?:わ)?せ|連絡先/.test(tail.slice(0, methodAt));
  });
  const methodParts = methodIndex < 0 ? [] : [clauses[methodIndex]];
  if (methodIndex >= 0) {
    for (const following of clauses.slice(methodIndex + 1, methodIndex + 3)) {
      if (following.length > 300 || !/^(?:ただし|但し|なお|※|電子メール|メール|FAX|郵送|持参|提出)/i.test(following) || /質問|問い合わせ|履行場所|納入期限/.test(following)) break;
      methodParts.push(following);
    }
  }
  const method = methodParts.join(" ") || undefined;
  const place = passage(/(?:履行場所|納入場所|納品場所)\s*[:：]?/);
  const qualification = item.classification?.otherQualificationEvidence || item.classification?.unifiedRequiredEvidence || item.classification?.unifiedEligibleEvidence || item.qualifications;
  const milestones = item.milestones || [];
  return [
    { label: "仕事内容", value: work?.value || item.title, evidence: work?.evidence || item.title },
    { label: "資格条件", value: qualification || "未確認・原文の参加条件を確認", evidence: qualification, unknown: !qualification },
    { label: "入札・見積締切", value: item.deadline || "未確認", evidence: item.deadlineEvidence, unknown: !item.deadline },
    { label: "先に必要な手続き", value: milestones.length ? milestones.map(m => `${m.label}：${m.date}${m.time ? " " + m.time : ""}`).join("\n") : "未確認・参加申請や説明会の有無を確認", evidence: milestones.length ? milestones.map(m => m.evidence).join("\n") : undefined, unknown: !milestones.length },
    { label: "提出方法（原文抜粋）", value: method || "未確認・公告や仕様書を確認", evidence: method, unknown: !method },
    { label: "履行・納品場所", value: place || "未確認", evidence: place, unknown: !place },
  ];
}
