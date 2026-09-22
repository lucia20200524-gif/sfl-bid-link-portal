import { env } from "cloudflare:workers";
import { db, ApiError } from "./server-store";
import { dateOffset, todayJst } from "./bid-domain";
import { collectionProgress } from "./discovery-collector";
import { digest, type DiscoveryItem } from "./discovery-domain";
import { matchesParticipationScope } from "./procurement-classification";

// This credential grants only a bounded report of already-public portal data.
// It cannot start collection, edit bids, register with Lark, or manage members.
export async function authorizeDigest(request:Request){
  const expected=(env as {LARK_DIGEST_TOKEN?:string}).LARK_DIGEST_TOKEN;
  if(!expected||expected.length<32)throw new ApiError(503,"週次レポートの接続は準備中です。");
  const supplied=request.headers.get("authorization")?.replace(/^Bearer /,"")??"";
  if(supplied.length>256||await digest(supplied)!==await digest(expected))throw new ApiError(401,"レポートの接続設定を確認してください。");
}
const line=(text:string,max=100)=>text.replace(/[\r\n\t]+/g," ").slice(0,max);
export async function discoveryDigest(now=Date.now()){
  const today=todayJst(new Date(now)),through=dateOffset(today,7),since=now-7*86400000;
  const totals=await db().prepare("SELECT COUNT(*) AS saved,SUM(CASE WHEN first_seen>=? THEN 1 ELSE 0 END) AS fresh,SUM(CASE WHEN changed_at>=? AND changed_at>first_seen THEN 1 ELSE 0 END) AS changed FROM discovery_candidates").bind(since,since).first<{saved:number;fresh:number|null;changed:number|null}>();
  const notices:DiscoveryItem[]=[];
  // Filter before the six-item cutoff, so ineligible records cannot crowd out
  // eligible deadlines. The stored corpus is retained for future re-checks.
  for(let offset=0;offset<20000&&notices.length<6;offset+=100){
    const soon=await db().prepare("SELECT data FROM discovery_candidates WHERE deadline>=? AND deadline<=? ORDER BY deadline,id LIMIT 100 OFFSET ?").bind(today,through,offset).all<{data:string}>();
    for(const row of soon.results){const item=JSON.parse(row.data) as DiscoveryItem;if(matchesParticipationScope(item))notices.push(item);if(notices.length===6)break;}
    if(soon.results.length<100)break;
  }
  const bids=await db().prepare("SELECT title,deadline,status FROM bids WHERE deadline>=? AND deadline<=? AND status IN ('new','reviewing','preparing') ORDER BY deadline,id LIMIT 6").bind(today,through).all<{title:string;deadline:string;status:string}>();
  const progress=await collectionProgress();
  const checked=progress.updatedAt?new Date(progress.updatedAt).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}):"未実施";
  const status=({idle:"未実施",running:"処理待ちあり",completed:"今回の処理終了",partial:"一部未確認",failed:"取得エラーあり",paused:"停止中"} as Record<string,string>)[progress.status]??"要確認";
  const message=[`📋 入札ポータルの週次確認｜${today}`,
    `過去7日間：新規保存 ${totals?.fresh??0}件 / 内容更新 ${totals?.changed??0}件`,
    `保存総数：${totals?.saved??0}件（新規・更新件数ともに、資格による表示対象外・締切済みを含む）`,"",
    "📅 本日〜7日後が提出期限の保存候補（統一資格対象・オープンカウンター、最大5件）",
    ...(notices.length?notices.slice(0,5).map(item=>`・${item.deadline}｜${line(item.title)}${item.retrievalIssue?"【再取得失敗・原文を確認】":item.withdrawalEvidence?"【中止・取消の記載あり】":""}\n  発注機関：${line(item.agency||"原文で確認",60)}\n  ${item.officialUrl}`):["保存情報に該当する候補はありません。"]),
    ...(notices.length>5?["ほかにも候補があります。ポータルで確認してください。"]:[]),"",
    "📝 ポータルで管理中・提出前の案件（最大5件）",
    ...(bids.results.length?bids.results.slice(0,5).map(bid=>`・${bid.deadline}｜${line(bid.title)}`):["該当する管理案件はありません。"]),"",
    `取得状況：${status} / 最終処理 ${checked}（日本時間）`,
    "この通知は保存情報の集計です。新たな公告の取得やLarkへの自動登録は行いません。自動収集は接続待ちです。",
    "締切の時刻・参加申請など先行手続き・変更や取消は公式公告で確認してください。"
  ].join("\n");
  return {date:today,message};
}
