import { validDate } from "./bid-domain";

export type BidDeadline = { date: string; evidence: string };

// The KKJ fields named TenderSubmissionDeadline, OpeningTendersEvent and
// PeriodEndTime mean bid START, opening and delivery respectively in its spec.
// Use only explicitly labelled bid/quotation/proposal submission deadlines.
const subject = "(?:入札書|入札|見積(?:り|もり)?書|企画提案書|技術提案書|提案書)";
const label = new RegExp(`${subject}(?:等)?(?:の)?(?:(?:提出|受領|受付|送付)(?:場所|方法)[、・及びと]*)?(?:提出|受領|受付|送付)?(?:締め?切[り]?|締切|期限|期間)(?:予定)?(?:日時|日|時刻)?`, "g");
const datePattern = /(?:(令和|平成|[RH])([0-9]{1,2}|元)年?(\d{1,2})月(\d{1,2})日|((?:19|20)\d{2})年(\d{1,2})月(\d{1,2})日|((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d))/gi;
const otherEvent = /開札|納入|履行|質問|説明書|参加(?:申請|資格|表明)|公告日|公示日|契約(?:期間|日)|入札開始|審査|交付|。/;

function parsedDate(match: RegExpMatchArray): string {
  const eraYear = match[2] === "元" ? 1 : Number(match[2]);
  if (match[1] && (eraYear < 1 || ((match[1] === "平成" || match[1].toUpperCase() === "H") && eraYear > 31))) return "";
  const year = match[1] ? (match[1] === "平成" || match[1].toUpperCase() === "H" ? 1988 : 2018) + (match[2] === "元" ? 1 : Number(match[2])) : Number(match[5] || match[8]);
  const month = Number(match[3] || match[6] || match[9]);
  const day = Number(match[4] || match[7] || match[10]);
  const date = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  return validDate(date) ? date : "";
}

export function extractBidDeadline(description: string): BidDeadline | undefined {
  const text = description.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ")
    .normalize("NFKC")
    // Keep the boundary between a numeric date and its time when collapsing
    // PDF/OCR whitespace (2026/10/02 17:00 must not become 2026/10/0217:00).
    .replace(/(\d{4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2})\s+(?=\d{1,2}[:時])/g, "$1T")
    .replace(/\s+/g, "");
  const found: BidDeadline[] = [];
  for (const heading of text.matchAll(label)) {
    // Bounded windows cannot jump from an empty deadline cell to another event.
    const start = heading.index! + heading[0].length;
    const window = text.slice(start,start + 160);
    const dates = [...window.matchAll(datePattern)];
    const first = dates[0];
    if (!first || first.index! > 90 || otherEvent.test(window.slice(0,first.index))) continue;
    // Month/day-only notices need an explicit year; never borrow the search year.
    if (/\d{1,2}月\d{1,2}日/.test(window.slice(0,first.index))) continue;
    let date = parsedDate(first);
    if (!date) continue;
    let end = first.index! + first[0].length;
    const tail = window.slice(end);
    const range = tail.match(/^(?:\([月火水木金土日](?:曜日)?\))?(?:T?(?:午前|午後)?\d{1,2}(?:時\d{0,2}分?|:\d{2})(?:まで)?|正午)?(?:から|[~〜～])/);
    if (range) {
      const remaining = tail.slice(range[0].length);
      const next = [...remaining.matchAll(datePattern)][0];
      const short = remaining.match(/^(?:同年)?(\d{1,2})月(\d{1,2})日/);
      let rangeEnd = "";
      if (next?.index === 0) {
        rangeEnd = parsedDate(next);
        end += range[0].length + next[0].length;
      } else if (short) {
        // Year inheritance is safe only within an explicitly written range.
        rangeEnd = `${date.slice(0,4)}-${short[1].padStart(2,"0")}-${short[2].padStart(2,"0")}`;
        end += range[0].length + short[0].length;
      }
      if (!validDate(rangeEnd) || rangeEnd < date) continue;
      date = rangeEnd;
    } else if (heading[0].includes("期間") && !/^(?:\([月火水木金土日](?:曜日)?\))?(?:(?:午前|午後)?\d{1,2}(?:時\d{0,2}分?|:\d{2})|正午)?まで/.test(tail)) {
      // A period with only its start present is not a closing date.
      continue;
    }
    found.push({date,evidence:text.slice(heading.index!,start+end)});
  }
  // Different submission methods, revisions or multiple notices can carry
  // different deadlines. Do not silently choose a convenient future date.
  const dates = new Set(found.map(item=>item.date));
  return dates.size === 1 ? found[0] : undefined;
}

export function isFutureBidDeadline(deadline: string, searchedOn: string): boolean {
  return validDate(deadline) && validDate(searchedOn) && deadline > searchedOn;
}
