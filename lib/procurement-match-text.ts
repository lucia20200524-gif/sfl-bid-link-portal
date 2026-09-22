import type { ProcurementCandidate } from "./procurement-search";

const normalize = (value:string, preserveWords=false) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, preserveWords?" ":"");

// Keep the original notice intact. The issuing body's name belongs to the
// agency filter, not the description of the work being procured.
export function procurementMatchText(item:Pick<ProcurementCandidate,"title"|"agency"|"descriptionText"|"summary">,preserveWords=false) {
  let body=normalize(item.descriptionText||item.summary,preserveWords);
  const agency=normalize(item.agency);
  const names=[agency,agency.replace(/^(?:防衛省)?(?:陸上自衛隊|海上自衛隊|航空自衛隊)/, "")];
  for(const name of new Set(names))if(name.length>=4){
    const pattern=preserveWords?new RegExp([...name].map(char=>char.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("\\s*"),"g"):name;
    body=body.replaceAll(pattern, "");
  }
  return {title:normalize(item.title,preserveWords),body};
}
