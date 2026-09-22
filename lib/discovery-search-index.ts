import { db } from "./server-store";
import { currentClassification, matchesParticipationScope } from "./procurement-classification";
import { candidateGradeCheck } from "./procurement-workbench";
import { isExcludedProcurement } from "./procurement-exclusions";
import { procurementMatchText } from "./procurement-match-text";
import type { DiscoveryItem } from "./discovery-domain";

// Bump when eligibility or text-normalization rules change. Old rows remain
// searchable through the authoritative fallback until bounded preparation ends.
export const discoverySearchVersion=2;
export type SearchMetadata=DiscoveryItem & {_eligible:boolean;_excluded:boolean};
export function searchProjection(item:DiscoveryItem) {
  const classification=currentClassification(item);
  const text=procurementMatchText(item),words=procurementMatchText(item,true);
  const {descriptionText:_body,summary:_summary,searchable:_searchable,...rest}=item as DiscoveryItem & {searchable?:string};
  const metadata:SearchMetadata={...rest,summary:"",classification,
    _excluded:isExcludedProcurement(item),
    _eligible:matchesParticipationScope(item,classification)&&candidateGradeCheck({...item,classification}).state!=="mismatch"};
  return [discoverySearchVersion,JSON.stringify(metadata),text.title+" "+text.body,text.title,text.body,words.title,words.body] as const;
}

// Data preparation is separate from schema migration and ordinary search.
// Compare the original data to avoid overwriting a concurrent notice refresh.
export async function prepareSearchBatch(limit=40) {
  const rows=await db().prepare("SELECT id,data FROM discovery_candidates WHERE search_version<? ORDER BY search_version,id LIMIT ?")
    .bind(discoverySearchVersion,limit).all<{id:string;data:string}>();
  if(rows.results.length)await db().batch(rows.results.map(row=>db().prepare("UPDATE discovery_candidates SET search_version=?,search_data=?,search_text=?,search_title=?,search_body=?,search_title_words=?,search_body_words=? WHERE id=? AND data=? AND search_version<?")
    .bind(...searchProjection(JSON.parse(row.data)),row.id,row.data,discoverySearchVersion)));
  return {prepared:rows.results.length,remaining:rows.results.length===limit};
}

let preparing:Promise<void>|undefined;
export function prepareSavedSearch() {
  // Coalesce requests in this worker. Cross-worker races use conditional writes.
  return preparing??=(async()=>{
    const end=Date.now()+20000;
    for(let batch=0;batch<10&&Date.now()<end;batch++){
      if(!(await prepareSearchBatch()).remaining)break;
    }
  })().finally(()=>{preparing=undefined;});
}
