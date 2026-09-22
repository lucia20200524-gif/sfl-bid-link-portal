import { requireSearchMember } from "@/lib/member-auth";
import {  reply, failure, db, columns } from "@/lib/server-store";
import { readWorkflow } from "@/lib/procurement-workbench";
import { todayJst, type Bid } from "@/lib/bid-domain";
export async function GET(request:Request){try{
  await requireSearchMember(request);
  const result=await db().prepare(`SELECT ${columns} FROM bids ORDER BY updated_at DESC LIMIT 5001`).all<Bid>();
  const bids:Bid[]=result.results.slice(0,5000),today=todayJst();
  const tasks=bids.filter(b=>["new","reviewing","preparing"].includes(b.status)).flatMap(b=>readWorkflow(b.workflow).tasks.filter(t=>!t.done).map(t=>({...t,bidId:b.id,bidTitle:b.title,officialUrl:b.officialUrl}))).sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999")||a.time.localeCompare(b.time));
  const results=bids.filter(b=>["won","lost","completed","passed"].includes(b.status)).map(b=>({...b,result:readWorkflow(b.workflow).result}));
  const groups=new Map<string,{winner:string;count:number;knownAmounts:number;includedTotal:number;excludedTotal:number;unknownTaxTotal:number}>();
  for(const b of results){const r=b.result;if(!r.winner)continue;const group=groups.get(r.winner)||{winner:r.winner,count:0,knownAmounts:0,includedTotal:0,excludedTotal:0,unknownTaxTotal:0};group.count++;if(r.amount){group.knownAmounts++;group[r.tax==="included"?"includedTotal":r.tax==="excluded"?"excludedTotal":"unknownTaxTotal"]+=Number(r.amount);}groups.set(r.winner,group);}
  const won=results.filter(b=>b.status==="won"||b.status==="completed").length,lost=results.filter(b=>b.status==="lost").length;
  return reply({tasks,results,competitors:[...groups.values()].sort((a,b)=>b.count-a.count),stats:{managed:bids.length,unassigned:bids.filter(b=>["new","reviewing","preparing"].includes(b.status)&&!b.assignee).length,overdue:tasks.filter(t=>t.date&&t.date<today).length,won,lost,winRate:won+lost?Math.round(won/(won+lost)*100):null},truncated:result.results.length>5000});
}catch(e){return failure(e);}}
