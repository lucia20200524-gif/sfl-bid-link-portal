import { validDate } from "./bid-domain";
import type { OfficialNotice } from "./defense-browser-parser";
import { msdfProcurementCatalog } from "./msdf-procurement-catalog";

// Only these inspected layouts have three consecutive date columns:
// 履行期限 / 本リスト掲載日 / 見積書提出期限. Other layouts stay unconfirmed.
const threeDateLayout = /\/bukei\/(?:m0\/nyuusatsu\/07open|s3\/nyuusatsu\/R8oclist(?:cd|ze)|s1\/nyuusatsu\/7opnlist|s4\/nyuusatsu\/oc(?:cd|zen)|sk\/nyuusatsu\/opn[^/]+)\.pdf$/i;
export function parseMsdfPdfList(text:string,url:string,title:string):{notices:OfficialNotice[];issue?:string}|undefined {
  if(!url.includes("/msdf/"))return;
  const normalized=text.normalize("NFKC");
  const flat=normalized.replace(/\s+/g," ").trim();
  const compact=normalized.replace(/\s+/g,"");
  const known=msdfProcurementCatalog.some(entry=>entry.listings.some(listing=>listing.url===url&&/オープンカウンタ/.test(listing.title)));
  if(!known && !/要求(?:件名|案件)リスト/.test((title+flat).replace(/\s+/g,"")))return;
  const ids=[...flat.matchAll(/[GD]\d{2}-[SD]\d{2}-\s*\d{10}-\d{2}/g)];
  const notices:OfficialNotice[]=[];
  const datePattern=/(?:令和\s*\d{1,2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|20\d{2}[./-]\d{1,2}[./-]\d{1,2})/g;
  const allowed=threeDateLayout.test(new URL(url).pathname)&&/履行期限.*本リスト掲載日.*見積書提出期限/.test(compact);
  for(let i=0;i<ids.length;i++){
    const id=ids[i];
    const row=flat.slice(id.index!+id[0].length,ids[i+1]?.index??flat.length);
    const dates=[...row.matchAll(datePattern)];
    if(!dates.length)continue; // column-oriented extraction cannot be assigned safely
    const rawTitle=row.slice(0,dates[0].index).trim();
    const itemTitle=rawTitle.replace(/\s+\d[\d,.]*(?:式|個|件|巻|着|台|本|枚|組|EA|Z[A-Z]{2})\s*$/i,"").trim();
    if(!itemTitle || itemTitle.length>250 || !/[一-龠ぁ-んァ-ヶa-z]/i.test(itemTitle))continue;
    let deadline:OfficialNotice["deadline"];
    // Extra dates (including appended footers) or missing cells are ambiguous.
    if(allowed&&dates.length===3){
      const raw=dates[2][0].replace(/\s+/g,"");
      const era=raw.match(/^令和(\d+)年(\d+)月(\d+)日$/);
      const iso=era?`${2018+Number(era[1])}-${era[2].padStart(2,"0")}-${era[3].padStart(2,"0")}`:raw.split(/[./-]/).map((p,n)=>n?p.padStart(2,"0"):p).join("-");
      if(validDate(iso))deadline={date:iso,evidence:`要求番号 ${id[0]}／見積書提出期限：${raw}（一覧の3列目の日付。履行期限・掲載日と区別）`};
    }
    // Do not copy qualifications or dates from another row into this candidate.
    const body=`調達方式：オープンカウンター。要求番号：${id[0]}。件名：${itemTitle}。${deadline?.evidence??"一覧の提出期限を個別に確認できていません。"} 等級・地域・参加条件は掲載元の原文を確認してください。`;
    notices.push({title:itemTitle,url,text:body,deadline});
  }
  const issue=notices.length!==ids.length||!notices.length||notices.some(n=>!n.deadline)
    ? "一覧PDFの一部は案件と提出期限の対応を確認できていません。未確認の期限を推測せず、原文URLを表示しています。" : undefined;
  return {notices,issue};
}
