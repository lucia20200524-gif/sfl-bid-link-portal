import { ApiError, db, type Actor } from "./server-store";
import type { BrowserJob } from "./defense-browser-types";

type JobRow={state_json:string;lease_token:string;locked_until:number};
export async function getBrowserJob(actor:Actor,id:string):Promise<BrowserJob>{
  const row=await db().prepare("SELECT state_json FROM defense_browser_jobs WHERE id=? AND created_by=?").bind(id,actor.id).first<JobRow>();
  if(!row)throw new ApiError(404,"検索の保存情報が見つかりません。新しく検索してください。");
  return JSON.parse(row.state_json);
}
export async function latestBrowserJob(actor:Actor,mode:string,source:string):Promise<BrowserJob|null>{
  const row=await db().prepare("SELECT state_json FROM defense_browser_jobs WHERE created_by=? AND mode=? AND source_id=?").bind(actor.id,mode,source).first<JobRow>();
  return row?JSON.parse(row.state_json):null;
}
export async function saveNewBrowserJob(actor:Actor,job:BrowserJob){
  await db().prepare("INSERT INTO defense_browser_jobs (id,created_by,mode,source_id,state_json,lease_token,locked_until,updated_at) VALUES (?,?,?,?,?,'',0,?) ON CONFLICT(created_by,mode,source_id) DO UPDATE SET id=excluded.id,state_json=excluded.state_json,lease_token='',locked_until=0,updated_at=excluded.updated_at")
    .bind(job.id,actor.id,job.mode,job.sourceId,JSON.stringify(job),Date.now()).run();
}
export async function claimBrowserJob(actor:Actor,id:string){
  const token=crypto.randomUUID(),now=Date.now();
  const row=await db().prepare("UPDATE defense_browser_jobs SET lease_token=?,locked_until=? WHERE id=? AND created_by=? AND locked_until<=? RETURNING state_json")
    .bind(token,now+90000,id,actor.id,now).first<JobRow>();
  if(!row){await getBrowserJob(actor,id);return null;}
  return {token,job:JSON.parse(row.state_json) as BrowserJob};
}
export async function commitBrowserJob(actor:Actor,job:BrowserJob,token:string){
  const state=JSON.stringify(job);
  if(new TextEncoder().encode(state).length>1_900_000)throw new ApiError(413,"検索の保存容量を超えました。条件を絞って再検索してください。");
  // An in-flight request cannot resurrect a cancelled/replaced job.
  const row=await db().prepare("UPDATE defense_browser_jobs SET state_json=?,lease_token='',locked_until=0,updated_at=? WHERE id=? AND created_by=? AND lease_token=? RETURNING id")
    .bind(state,Date.now(),job.id,actor.id,token).first();
  return !!row;
}
export async function cancelBrowserJob(actor:Actor,id:string,pause=false){
  // Invalidate a running lease atomically; JSON is updated in the same statement.
  await db().prepare("UPDATE defense_browser_jobs SET state_json=json_set(state_json,'$.status',?,'$.message',?),lease_token='',locked_until=0,updated_at=? WHERE id=? AND created_by=?")
    .bind(pause?"paused":"cancelled",pause?"検索を一時停止しました。保存した検索を再開できます。":"検索を停止しました。取得済みの結果を表示します。",Date.now(),id,actor.id).run();
  return getBrowserJob(actor,id);
}
