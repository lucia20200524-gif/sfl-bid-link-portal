import { gsdfCatalogRevision, gsdfProcurementCatalog } from "./gsdf-procurement-catalog";
import { msdfCatalogRevision, msdfProcurementCatalog } from "./msdf-procurement-catalog";
import { asdfCatalogRevision, asdfProcurementCatalog } from "./asdf-procurement-catalog";
import { parseMsdfPdfList } from "./msdf-pdf-list";
import { dateOffset, todayJst } from "./bid-domain";
import { classifyProcurement } from "./procurement-classification";
import { extractBidDeadline, isFutureBidDeadline } from "./procurement-deadline";
import { defenseBrowserRules, type DefenseSourceId } from "./defense-browser-rules";
import { normalizeBrowserText, officialDefenseUrl, parseOfficialHtml, procurementLinkPriority, type OfficialNotice } from "./defense-browser-parser";
import { browserLimits, type BrowserJob, type BrowserPage, type BrowserJobView } from "./defense-browser-types";
import type { CollectionMode } from "./collection-profiles";
import type { SearchScope } from "./procurement-search";
import { officialHttpError } from "./defense-fetch-error";
import { excludedGsdfTargets, isExcludedGsdfUrl, isExcludedProcurement } from "./procurement-exclusions";

export type BrowserTransport = { html: (url:string,options?:{refresh?:boolean})=>Promise<{html:string;url:string}>; pdf: (url:string)=>Promise<string>;pdfListing?:(url:string)=>Promise<{text:string;links:{url:string;title:string}[]}> };
export function newBrowserJob(mode:CollectionMode,sourceId:DefenseSourceId,keywords:string[],scope:SearchScope,now=new Date()):BrowserJob {
  const rule=defenseBrowserRules[sourceId];
  return {id:crypto.randomUUID(),mode,sourceId,keywords,scope,searchedOn:todayJst(now),startedAt:now.toISOString(),updatedAt:now.toISOString(),status:"running",
    queue:[{url:rule.entryUrl,target:-1,depth:0,kind:"root"}],seen:[],targets:rule.targets.map(name=>({name,visited:0,errors:0,limited:false,missing:false,notes:[]})),
    items:[],visited:0,lastTarget:-1,limited:false,message:"指定された公式ページの確認を開始します。",deadlineStats:{future:0,closed:0,unknown:0},inspected:0};
}
const pageKey=(p:BrowserPage)=>`${p.target}:${p.url}${p.repair?`:repair:${p.repair.url}`:""}`;
const priority=(p:BrowserPage)=>{
  if(p.kind==="root")return -1;
  const rank=p.priority??procurementLinkPriority(p.title??"",p.url,!!p.listingEvidence);
  // Reach all announcement/OC sections before one long list's attachments.
  return p.kind==="navigation"&&rank<=3?0:p.kind==="notice"&&rank===0?1:rank;
};
function enqueue(job:BrowserJob,page:BrowserPage){
  if(isExcludedGsdfUrl(page.url))return;
  if(!officialDefenseUrl(page.url) || job.seen.includes(pageKey(page)) || job.queue.some(p=>pageKey(p)===pageKey(page)))return;
  if(job.pageIssues?.some(issue=>issue.url===page.url&&issue.status===403)){recordPageIssue(job,page,officialHttpError(403).message,403);return;}
  if(page.depth>browserLimits.depth){job.limited=true;if(page.target>=0)job.targets[page.target].limited=true;return;}
  if(job.queue.length>=browserLimits.queued){
    const counts=job.targets.map((_,i)=>job.queue.filter(p=>p.target===i).length);
    const share=Math.ceil(browserLimits.queued/job.targets.length);
    // Reserve room for the inner listings of every base. A single large
    // procurement list must not crowd all the other bases out of the queue.
    const candidates=job.queue.map((p,i)=>({p,i})).filter(({p})=>p.target>=0&&(
      (p.target===page.target&&priority(p)>priority(page))||
      (p.target!==page.target&&(counts[page.target]??0)<share&&counts[p.target]>share)));
    candidates.sort((a,b)=>priority(b.p)-priority(a.p)||b.p.depth-a.p.depth);
    const victim=candidates[0];job.limited=true;
    if(!victim){if(page.target>=0)job.targets[page.target].limited=true;return;}
    job.targets[victim.p.target].limited=true;job.queue.splice(victim.i,1);
  }
  job.queue.push(page);
}
// Remap saved target indexes by name, including pending requests and errors.
// Do not delete registered bids or reset other institutions' success/refusal logs.
export function applyGsdfExclusions(job:BrowserJob){
  if(job.sourceId!=="gsdf")return false;
  const indexes=new Map<number,number>();
  const targets=job.targets.filter((target,index)=>{
    if(excludedGsdfTargets.some(name=>name===target.name))return false;
    indexes.set(index,indexes.size);return true;
  });
  const changed=targets.length!==job.targets.length;
  const keep=(target:number,url:string)=>!isExcludedGsdfUrl(url)&&(target<0||indexes.has(target));
  job.queue=job.queue.filter(p=>keep(p.target,p.url)).map(p=>({...p,target:p.target<0?p.target:indexes.get(p.target)!}));
  job.deferredNotices=job.deferredNotices?.filter(p=>keep(p.target,p.notice.url)).map(p=>({...p,target:p.target<0?p.target:indexes.get(p.target)!}));
  job.pageIssues=job.pageIssues?.filter(p=>keep(p.target,p.url)).map(p=>({...p,target:p.target<0?p.target:indexes.get(p.target)!}));
  job.seen=job.seen.flatMap(key=>{
    const match=key.match(/^(-?\d+):(.*)$/);if(!match)return [key];
    const target=Number(match[1]);if(!keep(target,match[2]))return [];
    return [`${target<0?target:indexes.get(target)}:${match[2]}`];
  });
  job.items=job.items.filter(item=>!isExcludedProcurement(item));
  job.targets=targets;
  if(changed){job.lastTarget=-1;job.catalogRevision=undefined;}
  return changed;
}
// Requeue only documents skipped by the former page-count limit, once.
export function upgradePdfPageLimit(job:BrowserJob){
  if(job.pdfPageLimitRemoved)return false;
  job.pdfPageLimitRemoved=true;
  const blocked=(job.pageIssues??[]).filter(issue=>issue.message==="40ページを超えるPDFのため未確認です。"&&issue.target>=0&&job.targets[issue.target]&&!isExcludedGsdfUrl(issue.url));
  for(const issue of blocked){
    const before=job.queue.length;
    const key=`${issue.target}:${issue.url}`;
    job.seen=job.seen.filter(seen=>seen!==key);
    enqueue(job,{url:issue.url,target:issue.target,depth:1,kind:"notice",title:issue.title,agency:job.targets[issue.target].name,parentUrl:issue.parentUrl});
    if(job.queue.length>before||job.queue.some(p=>p.url===issue.url&&p.target===issue.target)){
      job.pageIssues=job.pageIssues?.filter(p=>p!==issue);
      const target=job.targets[issue.target];target.errors=Math.max(0,target.errors-1);
      target.notes=target.notes.filter(note=>note!==issue.message);
    }
  }
  return blocked.length>0&&job.queue.length>0;
}
// Reparse known entry/list pages once after the traversal fix. Cached HTML is
// reusable; access refusals, rate-limit pauses and all saved notices survive.
export function upgradeProcurementTraversal(job:BrowserJob){
  if(job.traversalRevision==="procurement-paths-v2")return false;
  job.traversalRevision="procurement-paths-v2";
  job.queue=job.queue.filter(p=>p.kind==="root"||p.repair||priority(p)<99);
  if(!job.visited)return false;
  const catalog=job.sourceId==="gsdf"?gsdfProcurementCatalog:job.sourceId==="msdf"?msdfProcurementCatalog:asdfProcurementCatalog;
  const seeds=new Set(catalog.flatMap(e=>[e.entryUrl,...e.listingUrls]));
  job.seen=job.seen.filter(key=>!seeds.has(key.replace(/^-?\d+:/,"")));
  job.catalogRevision=undefined;
  const added=job.sourceId==="gsdf"?addGsdfCatalog(job):job.sourceId==="msdf"?addMsdfCatalog(job):addAsdfCatalog(job);
  if(job.status==="completed"&&job.visited<browserLimits.pages&&job.queue.length)job.status="running";
  return added;
}
// Also used to upgrade a saved run without restarting or re-fetching denied URLs.
export function addGsdfCatalog(job:BrowserJob) {
  applyGsdfExclusions(job);
  if(job.sourceId!=="gsdf" || job.catalogRevision===gsdfCatalogRevision)return false;
  job.catalogRevision=gsdfCatalogRevision;
  const before=job.queue.length;
  gsdfProcurementCatalog.forEach(entry=>{
    const index=job.targets.findIndex(t=>t.name===entry.name);if(index<0)return;
    const target=job.targets[index];target.url??=entry.entryUrl;target.listingUrls=entry.listingUrls;target.missing=false;
    // Listings go first so top-level navigation cannot consume the page budget.
    for(const url of [...entry.listingUrls,entry.entryUrl])enqueue(job,{url,target:index,depth:1,kind:"navigation",priority:url===entry.entryUrl?3:1,title:entry.name,agency:url.includes("/eafin/")?"東部方面会計隊":entry.name,parentUrl:defenseBrowserRules.gsdf.entryUrl});
  });
  return job.queue.length>before;
}
export function addMsdfCatalog(job:BrowserJob) {
  if(job.sourceId!=="msdf" || job.catalogRevision===msdfCatalogRevision)return false;
  // Migrate the former three categories into base-level targets. Preserve the
  // overall budget, seen URLs, access refusals, and user/rate-limit pauses.
  const migrated=job.targets.length!==msdfProcurementCatalog.length||job.targets.some((t,i)=>t.name!==msdfProcurementCatalog[i].name);
  if(migrated){
    const targetFor=(url:string)=>{
      const exact=msdfProcurementCatalog.findIndex(e=>e.entryUrl===url||e.listingUrls.includes(url));
      return exact>=0?exact:msdfProcurementCatalog.findIndex(e=>url.startsWith(e.entryUrl.slice(0,e.entryUrl.lastIndexOf("/")+1)));
    };
    job.targets=msdfProcurementCatalog.map(entry=>({name:entry.name,visited:0,errors:0,limited:false,missing:false,notes:[]}));
    job.seen=job.seen.map(key=>{const url=key.replace(/^-?\d+:/,"");const target=targetFor(url);if(target>=0)job.targets[target].visited++;return `${target}:${url}`;});
    job.queue=job.queue.flatMap(page=>{const target=targetFor(page.url);return target>=0?[{...page,target}]:[];});
    job.pageIssues=job.pageIssues?.map(issue=>{
      const target=targetFor(issue.url);if(target>=0){job.targets[target].errors++;job.targets[target].notes.push(issue.message);}
      return {...issue,target};
    });
    job.lastTarget=-1;
  }
  job.catalogRevision=msdfCatalogRevision;
  const before=job.queue.length;
  msdfProcurementCatalog.forEach((entry,index)=>{
    const target=job.targets[index];target.url=entry.entryUrl;target.listingUrls=entry.listingUrls;target.missing=false;
    for(const listing of [...entry.listings,{url:entry.entryUrl,title:entry.name}]){
      enqueue(job,{url:listing.url,target:index,depth:1,kind:"navigation",title:listing.title,
        agency:listing.url.includes("/bukei/k0/")?"呉地方総監部":entry.name,parentUrl:entry.entryUrl===listing.url?defenseBrowserRules.msdf.entryUrl:entry.entryUrl});
    }
  });
  return migrated||job.queue.length>before;
}
export function addAsdfCatalog(job:BrowserJob) {
  if(job.sourceId!=="asdf" || job.catalogRevision===asdfCatalogRevision)return false;
  job.catalogRevision=asdfCatalogRevision;
  const before=job.queue.length;
  asdfProcurementCatalog.forEach(entry=>{
    const index=job.targets.findIndex(t=>t.name===entry.name);if(index<0)return;
    const target=job.targets[index];target.url=entry.entryUrl;target.listingUrls=entry.listingUrls;target.missing=false;
    for(const listing of [...entry.listings,{url:entry.entryUrl,title:entry.name}]){
      enqueue(job,{url:listing.url,target:index,depth:1,kind:"navigation",title:listing.title,agency:entry.name,
        parentUrl:listing.url===entry.entryUrl?defenseBrowserRules.asdf.entryUrl:entry.entryUrl});
    }
  });
  return job.queue.length>before;
}
function recordPageIssue(job:BrowserJob,page:BrowserPage,message:string,status?:number){
  job.pageIssues??=[];
  if(job.pageIssues.some(issue=>issue.url===page.url&&issue.target===page.target&&!issue.resolvedUrl))return;
  const target=job.targets[page.target];
  job.pageIssues.push({url:page.url,title:page.title||target?.name||"公式の入口ページ",target:page.target,message,status,parentUrl:page.parentUrl||target?.url||defenseBrowserRules[job.sourceId].entryUrl});
  if(target){target.errors++;if(target.notes.length<5)target.notes.push(message);}
  else job.targets.forEach(t=>{t.missing=true;if(t.notes.length<5)t.notes.push(message);});
}
// Older jobs stopped an entire service at the first denied page. Retire only
// that request without retrying it, preserving rate-limit/robots/user pauses.
export function resumePastDeniedPage(job:BrowserJob,now=new Date()){
  if(job.status!=="paused"||!(/^(?:公式ページ|PDF).*HTTP 403/.test(job.message)||/^アクセス制限・確認画面のため停止/.test(job.message)))return false;
  const page=job.queue.shift();if(!page)return false;
  recordPageIssue(job,page,officialHttpError(403).message,403);
  job.seen.push(pageKey(page));job.visited++;if(page.target>=0)job.targets[page.target].visited++;
  job.status=job.queue.length?"running":"completed";job.updatedAt=now.toISOString();
  job.message="アクセスが拒否されたページを未確認として記録しました。他の確認先の収集を進めます。";
  return true;
}
function addNotice(job:BrowserJob,notice:OfficialNotice,target:number,agency="",retrievalIssue?:{message:string;attemptedAt:number},sourceUrl?:string){
  const titleTerms=job.keywords.filter(k=>normalizeBrowserText(notice.title).includes(normalizeBrowserText(k)));
  const terms=job.scope==="title"?titleTerms:job.keywords.filter(k=>normalizeBrowserText(`${notice.title} ${notice.text}`).includes(normalizeBrowserText(k)));
  if(!terms.length&&!job.retainUnknown)return;
  job.inspected++;
  if(!notice.deadline){job.deadlineStats.unknown++;if(!job.retainUnknown)return;}
  if(notice.deadline&&!isFutureBidDeadline(notice.deadline.date,job.searchedOn)){job.deadlineStats.closed++;if(!job.retainUnknown)return;}
  // Same notice discovered through multiple paths is not inserted repeatedly.
  const key=`${normalizeBrowserText(notice.title)}|${notice.deadline?.date??"unknown"}`;
  const source=job.targets[target].name;
  const id=`${job.sourceId}:${source}:${key}`;
  const existing=job.items.find(i=>i.id===id);
  if(existing){
    // A linked notice may add qualification evidence absent from the list row.
    const extra=classifyProcurement({title:notice.title,description:notice.text,qualifications:"",contractMethod:""});
    existing.classification={...existing.classification,...extra};
    if(extra.openCounterEvidence)existing.contractMethod="オープンカウンター";
    if(notice.text.length>existing.summary.length)existing.summary=notice.text.slice(0,500);
    return;
  }
  if(notice.deadline&&isFutureBidDeadline(notice.deadline.date,job.searchedOn))job.deadlineStats.future++;
  const classification=classifyProcurement({title:notice.title,description:notice.text,qualifications:"",contractMethod:""});
  const item={id,title:notice.title,agency,deadline:notice.deadline?.date??"",deadlineEvidence:notice.deadline?.evidence,
    milestones:notice.milestones,retrievalIssue,
    officialUrl:notice.url,source,sourceUrl:sourceUrl??job.targets[target].url??defenseBrowserRules[job.sourceId].entryUrl,
    matchedKeywords:terms,summary:notice.text.slice(0,500),descriptionText:notice.text.slice(0,24000),classification,contractMethod:classification.openCounterEvidence?"オープンカウンター":"",
    matchLocation:titleTerms.length?"title" as const:"body" as const,searchSourceId:job.sourceId};
  job.items.push(item);
  job.items.sort((a,b)=>a.deadline.localeCompare(b.deadline)||a.title.localeCompare(b.title));
  if(!job.retainUnknown&&job.items.length>browserLimits.results){job.items.length=browserLimits.results;job.limited=true;}
}

// Exactly one page per request. The durable queue makes reloads resumable and
// avoids relying on detached promises/background work in a request Worker.
export async function advanceBrowserJob(job:BrowserJob,transport:BrowserTransport,now=new Date(),noticeLimit=Infinity,budgetSignal?:AbortSignal):Promise<BrowserJob>{
  const scopeChanged=applyGsdfExclusions(job);
  if(job.status!=="running")return job;
  let remaining=noticeLimit;
  const inspect=(notice:OfficialNotice,target:number,agency="",retrievalIssue?:{message:string;attemptedAt:number},sourceUrl?:string)=>{
    if(remaining<=0){(job.deferredNotices??=[]).push({notice,target,agency,retrievalIssue,sourceUrl});return;}
    remaining--;addNotice(job,notice,target,agency,retrievalIssue,sourceUrl);
  };
  if(job.deferredNotices?.length){
    const deferred=job.deferredNotices;job.deferredNotices=[];
    deferred.forEach(n=>inspect(n.notice,n.target,n.agency,n.retrievalIssue,n.sourceUrl));
    return job;
  }
  upgradePdfPageLimit(job);
  upgradeProcurementTraversal(job);
  if(job.sourceId==="gsdf"&&(scopeChanged||!!job.catalogRevision))addGsdfCatalog(job);
  if(job.sourceId==="msdf"&&(!!job.catalogRevision||job.targets.length!==msdfProcurementCatalog.length))addMsdfCatalog(job);
  if(job.sourceId==="asdf"&&job.catalogRevision)addAsdfCatalog(job);
  if(todayJst(now)!==job.searchedOn){if(job.retainUnknown)job.searchedOn=todayJst(now);else{job.status="cancelled";job.message="検索日が変わったため停止しました。今日の条件で新しく検索してください。";return job;}}
  if(job.visited>=browserLimits.pages){job.status="completed";job.limited=true;job.queue.forEach(p=>{if(p.target>=0)job.targets[p.target].limited=true;});job.queue=[];job.message="確認ページ数の上限に達しました。取得できた範囲の結果を表示します。";return job;}
  // Round robin across targets; large unit sites cannot starve other targets.
  const nextTarget=[...new Set(job.queue.map(p=>p.target))].sort((a,b)=>a-b);
  const selectedTarget=nextTarget.find(t=>t>job.lastTarget)??nextTarget[0];
  let index=-1;
  job.queue.forEach((p,i)=>{if(p.target===selectedTarget&&(index<0||priority(p)<priority(job.queue[index])))index=i;});
  const page=job.queue.splice(index,1)[0];
  if(!page){job.status="completed";return job;}
  const target=page.target>=0?job.targets[page.target]:null;
  if(target && target.visited>=browserLimits.pagesPerTarget){target.limited=true;job.limited=true;job.queue=job.queue.filter(p=>p.target!==page.target);return job;}
  job.lastTarget=page.target;
  if(target)target.lastAttemptAt=now.getTime();
  try{
    if(job.pageIssues?.some(issue=>issue.url===page.url&&issue.status===403))throw officialHttpError(403);
    if(/\.pdf$/i.test(new URL(page.url).pathname)){
      const indexPdf=!page.listingEvidence&&(/一覧|リスト/.test(page.title??"")||(job.sourceId==="asdf"&&asdfProcurementCatalog.some(entry=>entry.listingUrls.includes(page.url))));
      if(indexPdf){
        const listing=transport.pdfListing?await transport.pdfListing(page.url):{text:await transport.pdf(page.url),links:[]};
        const rows=parseMsdfPdfList(listing.text,page.url,page.title??"");
        rows?.notices.forEach(notice=>inspect(notice,page.target,page.agency,undefined,page.parentUrl));
        if(target&&rows?.notices.length)target.noticesFound=true;
        for(const link of listing.links){
          if(!officialDefenseUrl(link.url)||!new URL(link.url).pathname.startsWith(`/${job.sourceId}/`)||procurementLinkPriority(link.title,link.url)===99)continue;
          enqueue(job,{url:link.url,title:link.title,target:page.target,depth:page.depth+1,kind:"notice",agency:page.agency,parentUrl:page.url});
        }
        if(rows?.issue)recordPageIssue(job,page,rows.issue);
        else if(!rows)recordPageIssue(job,page,listing.links.length?"一覧PDF内の個別資料を確認します。一覧の全行・期限との対応は未確認のため、一部取得として表示します。":"一覧PDFの個別案件・提出期限を対応付けられませんでした。原文をご確認ください。");
      }else{
      const text=await transport.pdf(page.url);
      const list=parseMsdfPdfList(text,page.url,page.title??"");
      if(list){
        list.notices.forEach(notice=>inspect(notice,page.target,page.agency,undefined,page.parentUrl));
        if(target&&list.notices.length)target.noticesFound=true;
        if(list.issue)recordPageIssue(job,page,list.issue);
      }else{
        const evidence=page.listingEvidence;
        inspect({title:page.title??"公告",url:page.url,text:[text,evidence?.text].filter(Boolean).join("\n掲載一覧の根拠："),deadline:extractBidDeadline(text)??evidence?.deadline,milestones:evidence?.milestones},page.target,page.agency,undefined,page.parentUrl);
        if(target)target.noticesFound=true;
      }
      }
    }else{
      const response=await transport.html(page.url,page.repair?{refresh:true}:undefined);
      const parsed=parseOfficialHtml(response.html,response.url,job.sourceId,page.kind==="notice"?page.title:undefined);
      if(parsed.issue)recordPageIssue(job,page,parsed.issue);
      if(page.repair){
        // Only adopt an unambiguous link actually published by the parent.
        // No guessed paths, alternate hosts or retries of denied pages.
        const matches=parsed.links.filter(link=>normalizeBrowserText(link.title)===normalizeBrowserText(page.repair!.title));
        const targetUrl=parsed.targetLinks[page.target];
        if(targetUrl&&normalizeBrowserText(job.targets[page.target]?.name??"")===normalizeBrowserText(page.repair.title))matches.push({url:targetUrl,title:page.repair.title,notice:false});
        const urls=[...new Set(matches.map(link=>link.url))];
        if(urls.length===1&&urls[0]!==page.repair.url&&new URL(urls[0]).pathname.startsWith(`/${job.sourceId}/`)){
          const link=matches.find(link=>link.url===urls[0])!;
          enqueue(job,{url:link.url,target:page.target,depth:page.depth+1,kind:link.notice?"notice":"navigation",title:link.title,agency:page.agency,parentUrl:response.url,repairOf:page.repair.url});
        }
      }else if(page.kind==="root"){
        job.targets.forEach((t,i)=>{
          const url=parsed.targetLinks[i];
          if(url){t.url=url;enqueue(job,{url,target:i,depth:1,kind:"navigation",title:t.name,parentUrl:response.url,agency:t.name});}
        });
      }else{
        if(target && !parsed.issue && parsed.notices.length)target.noticesFound=true;
        if(target)target.listingUrls=[...new Set([...(target.listingUrls??[]),...parsed.links.filter(link=>!link.notice&&link.priority===1&&new URL(link.url).pathname.startsWith(`/${job.sourceId}/`)).map(link=>link.url)])].slice(0,60);
        parsed.notices.forEach(n=>inspect(n,page.target,page.agency,undefined,response.url));
        for(const link of parsed.links){
          if(!new URL(link.url).pathname.startsWith(`/${job.sourceId}/`))continue;
          if(link.url===defenseBrowserRules[job.sourceId].entryUrl)continue;
          // In title-only mode inspect matching notices and navigation pages.
          if(link.notice && job.scope==="title" && !job.keywords.some(k=>normalizeBrowserText(link.title).includes(normalizeBrowserText(k))) && !/^(?:公告|公示|仕様書|PDF|ダウンロード)[\s（(]/i.test(link.title+" "))continue;
          const unit=!link.notice && /地方総監部|補給処|基地|駐屯地|会計隊|支処|学校/.test(link.title) && link.title.length<100 ? link.title : page.agency;
          enqueue(job,{url:link.url,target:page.target,depth:page.depth+1,kind:link.notice?"notice":"navigation",priority:link.priority,title:link.title,agency:unit,parentUrl:response.url,listingEvidence:link.listingEvidence});
        }
      }
    }
    if(target)target.lastSuccessAt=now.getTime();
    if(page.repairOf){
      const issue=job.pageIssues?.find(issue=>issue.url===page.repairOf&&issue.target===page.target&&!issue.resolvedUrl);
      if(issue){issue.resolvedUrl=page.url;if(target){target.errors=Math.max(0,target.errors-1);const index=target.notes.indexOf(issue.message);if(index>=0)target.notes.splice(index,1);}}
    }
    job.message=page.repair?"掲載元で現在のリンクを照合しました。移動先が確認できた場合は続けて取得します。":page.kind==="root"?"指定先のリンクを確認しました。各掲載欄の確認を進めます。":`${target!.name}の掲載内容を確認しました。`;
  }catch(error){
    if(budgetSignal?.aborted){job.queue.unshift(page);return job;}
    const message=error instanceof Error?error.message.slice(0,300):"資料を取得できませんでした。";
    if(job.retainUnknown && page.kind==="notice" && target && page.title) inspect({title:page.title,url:page.url,text:""},page.target,page.agency,{message,attemptedAt:now.getTime()});
    if(error && typeof error==="object" && "pause" in error && error.pause){job.queue.unshift(page);job.status="paused";job.message=message;return job;}
    const status=error&&typeof error==="object"&&"status" in error&&typeof error.status==="number"?error.status:undefined;
    recordPageIssue(job,page,message,status);
    if(status===404&&!page.repair&&!page.repairOf&&page.parentUrl&&page.parentUrl!==page.url&&page.title){
      enqueue(job,{url:page.parentUrl,target:page.target,depth:Math.max(0,page.depth-1),kind:"navigation",agency:page.agency,repair:{url:page.url,title:page.title}});
    }
    job.message=message;
  }
  if(page.kind==="root"){addGsdfCatalog(job);addMsdfCatalog(job);addAsdfCatalog(job);}
  job.seen.push(pageKey(page));job.visited++;if(target)target.visited++;
  job.updatedAt=now.toISOString();
  if(!job.queue.length&&!job.deferredNotices?.length){job.status="completed";job.message=job.targets.some(t=>t.errors||t.missing||t.limited||!t.noticesFound)?"未確認・一部取得の確認先があります。取得状況と結果を確認してください。":"指定先の確認を終了しました。取得範囲内の結果です。";}
  return job;
}

export function browserJobView(job:BrowserJob):BrowserJobView{
  applyGsdfExclusions(job);
  const targets=job.targets.map((t,i)=>{
    const pending=job.queue.filter(p=>p.target===i).length;
    const state=t.missing || (t.errors>0&&t.errors===t.visited)?"failed":t.errors||t.limited?"partial":pending||!t.visited?"pending":!t.noticesFound?"partial":"checked";
    return {...t,pending,state} as BrowserJobView["progress"]["targets"][number];
  });
  return {progress:{id:job.id,mode:job.mode,sourceId:job.sourceId,status:job.status,visited:job.visited,queued:job.queue.length,limit:browserLimits.pages,limited:job.limited,message:job.message,targets},
    result:{method:"official-browser",items:job.items,sources:targets.map(t=>({title:t.name,status:t.state==="failed"?"failed":"partial",count:job.items.filter(i=>i.source===t.name).length})),
      collectedAt:job.updatedAt,message:job.message,limit:browserLimits.results,inspectedCount:job.inspected,deadlineStats:job.deadlineStats,
      scopeNotice:`指定先からたどった公開ページの取得範囲です。最大${browserLimits.pages}ページ・確認先ごと${browserLimits.pagesPerTarget}ページまで確認します。資料の形式やアクセス制限により未確認の案件があります。全国の全案件数ではありません。`,
      search:{sourceId:job.sourceId,scope:job.scope,keywords:job.keywords,searchedOn:job.searchedOn,deadlineFrom:dateOffset(job.searchedOn,1),deadlinePolicy:"future-only"}}};
}
