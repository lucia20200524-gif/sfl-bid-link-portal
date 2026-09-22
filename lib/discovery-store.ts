import { compileKeywordMatcher, keywordGroups } from "./procurement-synonyms";
import { isExcludedProcurement } from "./procurement-exclusions";
import { db, ApiError, type Actor } from "./server-store";
import { advancedSearchSchema, matchesAdvanced, readCompanyProfile, candidateGradeCheck, type AdvancedSearch } from "./procurement-workbench";
import { todayJst,validDate } from "./bid-domain";
import { defaultLarkMode, type CollectionMode, type LarkMode } from "./collection-profiles";
import { matchesProcurementSource, type ProcurementSourceId } from "./procurement-sources";
import { currentClassification, matchesParticipationScope, matchesResultCategory, type ResultCategory } from "./procurement-classification";
import { larkRegistrationKey } from "./lark-registration";
import { larkScope, scopedLarkKey } from "./member-lark-store";
import { digest, discoveryIdentity, discoveryPreview, enrichCandidate, rankCandidate, compareCandidates, candidateBucket, discoveryTerms, norm, type DiscoveryItem, type DiscoveryBucket } from "./discovery-domain";
import { discoverySearchVersion,searchProjection,type SearchMetadata } from "./discovery-search-index";

export async function saveDiscovered(items:DiscoveryItem[]) {
  let count=0;
  const inputs=new Map<string,DiscoveryItem>();
  for(const input of items){if(isExcludedProcurement(input))continue;const id=await discoveryIdentity(input),prior=inputs.get(id);inputs.set(id,{...(input.retrievalIssue&&prior&&!prior.retrievalIssue?prior:input),origins:[...new Set([...(prior?.origins??(prior?[prior.sourceUrl]:[])),...(input.origins??[input.sourceUrl])])]});}
  const entries=[...inputs.entries()];
  for(let offset=0;offset<entries.length;offset+=50){
    const group=entries.slice(offset,offset+50),ids=group.map(([id])=>id),now=Date.now();
    const rows=await db().prepare(`SELECT id,data,fingerprint FROM discovery_candidates WHERE id IN (${ids.map(()=>"?").join(",")})`).bind(...ids).all<{id:string;data:string;fingerprint:string}>();
    const previous=new Map<string,DiscoveryItem>(rows.results.map((row:{id:string;data:string;fingerprint:string})=>[row.id,{...JSON.parse(row.data),fingerprint:row.fingerprint}]));
    const writes=[];
    for(const [id,input] of group){
      const old=previous.get(id);
      // A failed refresh is an observation about retrieval, not a new notice.
      // Keep the last successful body/deadline and its version/review identity.
      if(old && input.retrievalIssue){
        const retained={...old,retrievalIssue:input.retrievalIssue,origins:[...new Set([...(old.origins??[]),...(input.origins??[input.sourceUrl])])]};
        writes.push(db().prepare("UPDATE discovery_candidates SET data=?,search_version=?,search_data=?,search_text=?,search_title=?,search_body=?,search_title_words=?,search_body_words=? WHERE id=?").bind(JSON.stringify(retained),...searchProjection(retained),id));
        continue;
      }
      const item=enrichCandidate({...input,id,descriptionText:input.descriptionText?.slice(0,24000),agency:input.agency||old?.agency||"",
        origins:[...new Set([...(old?.origins??[]),...(input.origins??[input.sourceUrl])])]});
      const withdrawalEvidence=/[（(【]?(?:入札|調達|公告|公募)?(?:の)?(?:中止|取消し|取り消し|取下げ|取り下げ)[）)】]?/.test(item.title) ? item.title : undefined;
      item.withdrawalEvidence=withdrawalEvidence;
      const searchable=norm(`${item.title} ${item.descriptionText||item.summary}`);
      const fingerprint=await digest(JSON.stringify([item.title,item.agency,item.deadline,item.deadlineEvidence,item.descriptionText??item.summary,item.classification,item.milestones]));
      if(old && old.fingerprint!==fingerprint){
        const snapshot={title:old.title,agency:old.agency,deadline:old.deadline,deadlineEvidence:old.deadlineEvidence,milestones:old.milestones,summary:old.summary,officialUrl:old.officialUrl};
        writes.push(db().prepare("INSERT INTO discovery_revisions (id,candidate_id,data,recorded_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(id+":"+(old.fingerprint||await digest(JSON.stringify(snapshot))),id,JSON.stringify(snapshot),now));
      }
      item.fingerprint=fingerprint;
      writes.push(db().prepare("INSERT INTO discovery_candidates (id,data,first_seen,last_seen,changed_at,fingerprint,deadline,search_version,search_data,search_text,search_title,search_body,search_title_words,search_body_words) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,last_seen=excluded.last_seen,changed_at=CASE WHEN discovery_candidates.fingerprint=excluded.fingerprint THEN discovery_candidates.changed_at ELSE excluded.changed_at END,fingerprint=excluded.fingerprint,deadline=excluded.deadline,search_version=excluded.search_version,search_data=excluded.search_data,search_text=excluded.search_text,search_title=excluded.search_title,search_body=excluded.search_body,search_title_words=excluded.search_title_words,search_body_words=excluded.search_body_words")
        .bind(id,JSON.stringify({...item,searchable}),now,now,now,fingerprint,item.deadline,...searchProjection(item)));
      count++;
    }
    if(writes.length)await db().batch(writes);
  }
  return count;
}

export async function setDiscoveryReview(actor:Actor,mode:CollectionMode,id:string,state:"new"|"reviewed"|"dismissed",reason:string) {
  const item=await db().prepare("SELECT fingerprint FROM discovery_candidates WHERE id=?").bind(id).first<{fingerprint:string}>();
  if(!item)throw new ApiError(404,"案件が見つかりません。再読み込みしてください。");
  const key=await digest(`${actor.id}|${mode}|${id}`);
  await db().prepare("INSERT INTO discovery_reviews (key,user_id,mode,candidate_id,state,reason,reviewed_version,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET state=excluded.state,reason=excluded.reason,reviewed_version=excluded.reviewed_version,updated_at=excluded.updated_at")
    .bind(key,actor.id,mode,id,state,reason,item.fingerprint,Date.now()).run();
}
export async function confirmDiscoveryDeadline(actor:Actor,mode:CollectionMode,id:string,deadline:string,evidence:string) {
  if(!validDate(deadline)||deadline<=todayJst())throw new ApiError(400,"今日より未来の提出期限を入力してください。");
  const row=await db().prepare("SELECT data FROM discovery_candidates WHERE id=?").bind(id).first<{data:string}>();
  if(!row)throw new ApiError(404,"案件が見つかりません。");
  const item:DiscoveryItem=JSON.parse(row.data);
  await saveDiscovered([{...item,deadline,deadlineEvidence:`原文を${actor.name}が確認：${evidence}`,needsReview:[],retrievalIssue:undefined}]);
  await setDiscoveryReview(actor,mode,id,"reviewed","");
}
type Stored={id:string;data:string;first_seen:number;last_seen:number;changed_at:number;fingerprint:string;search_hits?:string|null};
export async function discoveryFeed(actor:Actor,options:{mode:CollectionMode;larkMode?:LarkMode;source:ProcurementSourceId|"all";bucket:DiscoveryBucket;category:ResultCategory;keywords:string[];offset:number;newOnly:boolean;exclude:string[];filters?:AdvancedSearch;allKeywords?:boolean;pageSize?:number;stopAfter?:number;candidateLimit?:number;candidateIds?:string[];includePool?:boolean}) {
  const today=todayJst(),filters=advancedSearchSchema.parse(options.filters??{});
  // A new free-mode form has no implicit SFL query and does not scan the corpus.
  if((options.mode==="free"&&!options.keywords.length)||options.candidateIds?.length===0)return {items:[],...(options.includePool?{pool:[]}:{}),total:0,counts:{all:0,recommended:0,related:0,attention:0,reviewed:0},today,truncated:false,qualificationExcluded:0,offset:0};
  const registrationMode=options.mode==="free"?(options.larkMode??"free"):defaultLarkMode(options.mode);
  const connectionScope=await larkScope(actor,registrationMode);
  type Review={candidate_id:string;state:"new"|"reviewed"|"dismissed";reason:string;reviewed_version:string};
  const [preference,reviews,registrations]=await Promise.all([
    db().prepare("SELECT profile FROM procurement_preferences WHERE user_id=?").bind(actor.id).first<{profile:string}>(),
    db().prepare("SELECT candidate_id,state,reason,reviewed_version FROM discovery_reviews WHERE user_id=? AND mode=?").bind(actor.id,options.mode).all<Review>(),
    db().prepare("SELECT key FROM lark_bid_registrations WHERE connection_scope=? AND mode=? AND state='registered'").bind(connectionScope,registrationMode).all<{key:string}>(),
  ]);
  const companyProfile=readCompanyProfile(preference?.profile);
  const terms=options.keywords.length?options.keywords:options.allKeywords?[]:discoveryTerms[options.mode];
  const groups=keywordGroups(terms,filters.synonyms!=="off");
  const matchKeywords=compileKeywordMatcher(groups,filters.scope);
  const searchable=`CASE WHEN search_version=${discoverySearchVersion} THEN search_text ELSE json_extract(data,'$.searchable') END`;
  const termClause=groups.map(()=>`EXISTS (SELECT 1 FROM json_each(?) term WHERE (${searchable}) LIKE term.value ESCAPE '\\')`).join(filters.match==="all"?" AND ":" OR ");
  const termsBindings=groups.map(group=>JSON.stringify(group.terms.map(term=>`%${norm(term).replace(/[\\%_]/g,"\\$&")}%`)));
  const conditions=[termClause?`(${termClause})`:"1=1"],args:(string|number)[]=[...termsBindings];
  if(options.candidateIds){conditions.push("id IN (SELECT value FROM json_each(?))");args.push(JSON.stringify(options.candidateIds));}
  if(filters.period==="future"){conditions.push("(deadline='' OR deadline>?)");args.push(today);}
  if(filters.period==="closed"){conditions.push("deadline<>'' AND deadline<=?");args.push(today);}
  if(filters.deadlineFrom){conditions.push("deadline>=?");args.push(filters.deadlineFrom);}
  if(filters.deadlineTo){conditions.push("deadline<>'' AND deadline<=?");args.push(filters.deadlineTo);}
  const byId=new Map<string,Review>((reviews.results as Review[]).map(v=>[v.candidate_id,v]));
  const registeredKeys=new Set((registrations.results as {key:string}[]).map(v=>v.key));
  // Compute exact matches next to the saved normalized text; return only hit
  // positions and compact metadata. Full announcement bodies are read for 12 cards.
  const sqlTerms=JSON.stringify(groups.flatMap((group,g)=>group.terms.map((term,t)=>({g,t,key:norm(term),word:/^[a-z]{2,5}$/.test(norm(term))?1:0}))));
  const sqlMatch=(part:"title"|"body")=>`CASE WHEN json_extract(term.value,'$.word')=1 THEN (' '||search_${part}_words||' ') GLOB ('*[^a-z]'||json_extract(term.value,'$.key')||'[^a-z]*') ELSE instr(search_${part},json_extract(term.value,'$.key'))>0 END`;
  const titleHit=sqlMatch("title"),bodyHit=filters.scope==="fulltext"?sqlMatch("body"):"0";
  const hitSelect=`CASE WHEN search_version=${discoverySearchVersion} THEN (SELECT json_group_array(json_array(json_extract(term.value,'$.g'),json_extract(term.value,'$.t'),CASE WHEN ${titleHit} THEN 'title' ELSE 'body' END)) FROM json_each(?) term WHERE (${titleHit}) OR (${bodyHit})) ELSE NULL END AS search_hits`;
  const storedMatches=(row:Stored,raw:DiscoveryItem)=>{
    if(row.search_hits==null)return matchKeywords(raw);
    const matches=groups.map(group=>({...group,hits:[] as ReturnType<typeof matchKeywords>[number]["hits"]}));
    for(const [g,t,location] of JSON.parse(row.search_hits) as [number,number,"title"|"body"][]){
      const group=matches[g],term=group.terms[t];group.hits.push({input:group.input,term,location,direct:norm(term)===norm(group.input)});
    }
    return matches;
  };
  const hydrate=async(row:Stored,raw:DiscoveryItem=JSON.parse(row.data),matches=matchKeywords(raw))=>{
    const review=byId.get(row.id);
    const item=rankCandidate({...raw,firstSeen:row.first_seen,lastSeen:row.last_seen,changedAt:row.changed_at,fingerprint:row.fingerprint,review:review?.state??"new",reviewReason:review?.reason,updatedSinceReview:!!review&&review.state!=="new"&&review.reviewed_version!==row.fingerprint},options.mode,terms,groups,filters.scope,matches);
    item.classification=row.search_hits!=null?raw.classification:currentClassification(raw);
    item.registered=registeredKeys.size>0&&registeredKeys.has(await scopedLarkKey(connectionScope,await larkRegistrationKey(registrationMode,item)));return item;
  };
  const counts={all:0,recommended:0,related:0,attention:0,reviewed:0};
  // Stream bounded batches, retaining only sort keys. Full notice bodies are
  // fetched for the selected page, never held for the whole corpus in memory.
  const matches:{id:string;score:number;deadline:string;firstSeen:number;changedAt:number}[]=[];
  const previews=new Map<string,DiscoveryItem>();
  let scanned=0,truncated=false,candidateLimitReached=false,qualificationExcluded=0,cursor="";
  // Seek from the last primary key instead of re-scanning every preceding page.
  // A bounded batch keeps long notice bodies out of the full-corpus sort state.
  const batchSize=250;
  scan: for(;scanned<20000;){
    const rows=await db().prepare(`SELECT id,CASE WHEN search_version=${discoverySearchVersion} THEN search_data ELSE data END AS data,first_seen,last_seen,changed_at,fingerprint,${hitSelect} FROM discovery_candidates WHERE ${conditions.join(" AND ")} AND id>? ORDER BY id LIMIT ?`).bind(sqlTerms,...args,cursor,Math.min(batchSize,20000-scanned)).all<Stored>();
    scanned+=rows.results.length;
    for(const row of rows.results){
      const raw:SearchMetadata=JSON.parse(row.data),keywordHits=storedMatches(row,raw),prepared=row.search_hits!=null;
      if(prepared?raw._excluded:isExcludedProcurement(raw))continue;
      if(!matchesAdvanced(raw,filters,terms,groups,keywordHits)||(options.source!=="all"&&!matchesProcurementSource(options.source,raw))||(options.source==="kkj"&&!raw.origins?.includes("https://www.kkj.go.jp/s/")))continue;
      if(options.exclude.some(word=>norm(`${raw.title} ${raw.agency}`).includes(norm(word))))continue;
      const item=await hydrate(row,raw,keywordHits);
      if(options.newOnly&&Date.now()-(item.firstSeen??0)>7*86400000&&!item.updatedSinceReview)continue;
      if(prepared?!raw._eligible:(!matchesParticipationScope(item,item.classification)||candidateGradeCheck(item).state==="mismatch")){qualificationExcluded++;continue;}
      if(prepared?(options.category==="open-counter"&&!item.classification?.openCounterEvidence||options.category==="unified-required"&&!item.classification?.unifiedEligibleEvidence||options.category==="municipal"&&!item.classification?.municipal):!matchesResultCategory(item,options.category,item.classification))continue;
      const bucket=candidateBucket(item,today);counts.all++;if(bucket!=="closed")counts[bucket]++;
      if(options.bucket==="all"||bucket===options.bucket){
        matches.push({id:row.id,score:item.score??0,deadline:item.deadline,firstSeen:row.first_seen,changedAt:row.changed_at});
        if(options.includePool)previews.set(row.id,discoveryPreview(item));
      }
      // Saved searches use a bounded display pool. Manual runs are restricted
      // to the actual notice IDs inspected during that run, above.
      // Count all eligible buckets, so switching tabs cannot restart a full scan.
      if(options.candidateLimit&&counts.all>=options.candidateLimit){candidateLimitReached=true;break scan;}
      if(options.stopAfter&&matches.length>=options.stopAfter)break scan;
    }
    if(rows.results.length<batchSize)break;
    cursor=rows.results.at(-1)!.id;
    if(scanned>=20000)truncated=true;
  }
  matches.sort((a,b)=>filters.sort==="deadline"?(a.deadline||"9999").localeCompare(b.deadline||"9999")||a.id.localeCompare(b.id):filters.sort==="newest"?b.firstSeen-a.firstSeen||a.id.localeCompare(b.id):filters.sort==="updated"?b.changedAt-a.changedAt||a.id.localeCompare(b.id):b.score-a.score||(a.deadline||"9999").localeCompare(b.deadline||"9999")||b.firstSeen-a.firstSeen||a.id.localeCompare(b.id));
  const ids=matches.slice(options.offset,options.offset+(options.pageSize??20)).map(v=>v.id);
  const selected=ids.length?await db().prepare(`SELECT id,data,first_seen,last_seen,changed_at,fingerprint FROM discovery_candidates WHERE id IN (${ids.map(()=>"?").join(",")})`).bind(...ids).all<Stored>():{results:[]};
  const hydrated:DiscoveryItem[]=await Promise.all((selected.results as Stored[]).map(row=>hydrate(row)));
  return {items:ids.map(id=>hydrated.find(v=>v.id===id)!),...(options.includePool?{pool:matches.map(v=>previews.get(v.id)!)}:{}),total:matches.length,counts,today,truncated,candidateLimitReached,qualificationExcluded,qualificationGrades:{goodsGrade:companyProfile.goodsGrade,serviceGrade:companyProfile.serviceGrade,purchaseGrade:companyProfile.purchaseGrade},offset:options.offset};
}

export async function discoveryHistory(id:string){
  const result=await db().prepare("SELECT data,recorded_at FROM discovery_revisions WHERE candidate_id=? ORDER BY recorded_at DESC LIMIT 10").bind(id).all<{data:string;recorded_at:number}>();
  return (result.results as {data:string;recorded_at:number}[]).map(row=>({...JSON.parse(row.data),recordedAt:row.recorded_at}));
}
