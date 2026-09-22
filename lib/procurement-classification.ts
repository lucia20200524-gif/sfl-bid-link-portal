export const resultCategories = [
  { id: "all", label: "対象案件すべて" },
  { id: "open-counter", label: "オープンカウンター" },
  { id: "unified-required", label: "全省庁統一資格対象" },
  { id: "municipal", label: "自治体案件" },
] as const;
export type ResultCategory = typeof resultCategories[number]["id"];
export type ProcurementClassification = { municipal?: boolean; openCounterEvidence?: string; unifiedRequiredEvidence?: string; unifiedEligibleEvidence?: string; otherQualificationEvidence?: string };

export const participationScopeNotice = "国の案件に加え、市・区・町・村・都道府県の案件も候補に含めます。自治体独自の登録・地域・法人実績・再委託条件は個別確認が必要です。検索一致や確認済みの表示は、参加資格を満たすことを保証しません。";

const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, "");
const openCounter = /オープン[・･]?カウンター?/;
const unified = /全省庁統一(?:参加)?資格/;
const requirement = /(?:資格を)?有(?:する|している)(?:者|こと)|格付けされ.{0,60}(?:者|こと)|(?:認定|資格取得).{0,30}(?:受け|している|された)(?:者|こと)|(?:資格|取得).{0,12}(?:必須|必要である|必要です|を要する)/;
const localAuthority = /(?:本|当)(?:都|道|府|県|市|区|町|村)|都道府県|市区町村|地方公共団体|地方自治体|[一-龠ヶぁ-んァ-ヶ]{2,18}(?:県|都|府|市|区|町|村)/;
const registration = /(?:入札|競争)(?:入札)?(?:参加)?(?:有)?資格|名簿|登録資格/;
const registrationRequired = /(?:登載|登録|記載|認定|格付け)(?:され|を受け|をして|して|済|がある|のある)|資格を有(?:する|して)|(?:資格|登録).{0,25}(?:必須|必要|要する)/;
const qualificationWaived = /(?:資格|登録|名簿).{0,35}(?:不要|要しない|問わず|問わない|必要(?:では|は)?ない|なくても)/;
const unifiedNegative = /全省庁統一(?:参加)?資格.{0,90}(?:有しない|有していない|利用できない|使用できない|認めない|認められない|対象外|含まない)/;

// Conservative text classification, not a determination of a bidder's eligibility.
// Certification grades alone, national agency names and general tender types are insufficient.
export function classifyProcurement(input: { title: string; description: string; contractMethod?: string; qualifications?: string }): ProcurementClassification {
  const title = normalize(input.title), method = normalize(input.contractMethod || "");
  const body = normalize(input.description);
  const classification: ProcurementClassification = {};
  const direct = [title, method].find(text => openCounter.test(text) && !/オープン[・･]?カウンター?(?:方式)?(?:ではない|対象外|を除く)/.test(text));
  if (direct) classification.openCounterEvidence = direct.slice(0,250);
  else {
    // Exclude bare navigation/menu mentions; require the notice's procedure language.
    const match = body.match(/(?:調達種別|契約方式|調達方式)[:：]?オープン[・･]?カウンター?(?:方式)?(?:\(少額\))?|オープン[・･]?カウンター?(?:方式)?(?:\(少額\))?(?:方式)?(?:による見積(?:依頼|合[わせ]*)|により.{0,40}(?:見積|調達|契約)|で.{0,25}見積|を実施)/);
    if (match) classification.openCounterEvidence = body.slice(Math.max(0,match.index! - 20),match.index! + match[0].length + 100);
  }

  for (const text of [normalize(input.qualifications || ""), body]) {
    for (const match of text.matchAll(new RegExp(unified.source,"g"))) {
      const start = match.index!;
      const before = text.slice(Math.max(0,start-180),start);
      const after = text.slice(start,start+650);
      // Alternative eligibility and exceptions make an unconditional 'required' label unsafe.
      const context = before + after;
      const precedingClause=before.split(/[。！？;]/).at(-1)||"";
      if(/(?:又は|または|若しくは|もしくは)/.test(precedingClause)&&/(?:登録|名簿|資格)/.test(precedingClause))continue;
      if (/次のいずれか|以下のいずれか|いずれか(?:の資格|に該当)|又は同等|または同等/.test(context)) continue;
      if (/(?:資格|取得).{0,45}(?:不要|要しない|問わない|問わず|必要(?:では|は)?ない|なくても)/.test(context)) continue;
      if (/(?:資格|認定).{0,60}(?:未取得|有しない|有していない|ない者|いない者).{0,140}(?:参加|提出|認め)/.test(context)) continue;
      // Stop the positive clause at punctuation so unrelated requirements cannot supply its predicate.
      const clause = after.split(/[。！？]/,1)[0].slice(0,400);
      // 'A又はB' is a choice of grade within the same qualification, not an alternative qualification.
      const eligibility = clause.replace(/(?:又は|または|若しくは|もしくは)(?=[「『"']?[A-D][」』"']?(?:等級|[の、,]|又は|または))/g,"／");
      if (/(?:又は|または|若しくは|もしくは).{0,100}(?:登録|名簿|認定|資格を有)/.test(eligibility)) continue;
      if (requirement.test(clause)) {
        classification.unifiedRequiredEvidence = clause.slice(0,400);
        break;
      }
    }
    if (classification.unifiedRequiredEvidence) break;
  }
  // An accepted alternative is a usable qualification route, but is not
  // labelled "required". Never infer this from a national issuer or a link.
  for (const text of [normalize(input.qualifications || ""), body]) {
    for (const match of text.matchAll(new RegExp(unified.source,"g"))) {
      const clause=text.slice(match.index!,match.index!+400).split(/[。！？;]/,1)[0];
      if(requirement.test(clause)&&!unifiedNegative.test(clause)&&!qualificationWaived.test(clause)){
        const before=text.slice(Math.max(0,match.index!-250),match.index!).split(/[。！？;]/).at(-1)||"";
        classification.unifiedEligibleEvidence=before+clause;
        break;
      }
    }
    // A separate mandatory local / construction qualification vetoes both
    // unified and open-counter matches. OR within this same clause is allowed;
    // ambiguous cross-clause exceptions are intentionally not assumed.
    for(const clause of text.split(/[。！？;]/)){
      const local=[...clause.matchAll(new RegExp(`${localAuthority.source}|(?:市|県)の`,"g"))].some(match=>{
        const tail=clause.slice(match.index!+match[0].length),qualification=tail.match(registration);
        if(!qualification||qualification.index!>=80||unified.test(tail.slice(0,qualification.index!+qualification[0].length)))return false;
        const own=tail.slice(qualification.index!).split(/全省庁統一(?:参加)?資格|[、,]/,1)[0];
        return registrationRequired.test(own)&&!qualificationWaived.test(own);
      });
      const construction=/(?:建設工事|測量|建設コンサルタント).{0,90}(?:参加資格|有資格者名簿)/.test(clause);
      if(!local&&!(construction&&registrationRequired.test(clause)&&!qualificationWaived.test(clause)))continue;
      const eligibility=clause.replace(/(?:又は|または|若しくは|もしくは)(?=[「『"']?[A-D][」』"']?(?:等級|[の、,]|又は|または))/g,"／");
      const alternative=unified.test(clause)&&requirement.test(clause)&&!unifiedNegative.test(clause)&&/(?:又は|または|若しくは|もしくは)/.test(eligibility)&&!/(?:かつ|且つ|及び|並びに|併せて|あわせて)/.test(eligibility);
      if(!alternative)classification.otherQualificationEvidence=clause.slice(0,500);
    }
  }
  return classification;
}

type ClassifiedNotice = { title?:string; agency?:string; officialUrl?:string; descriptionText?:string; summary?:string; qualifications?:string; contractMethod?:string; classification?:ProcurementClassification };
export function currentClassification(item:ClassifiedNotice):ProcurementClassification {
  // Re-evaluate saved records as well as newly collected notices. Retain the
  // original evidence if it fell beyond the saved 24,000-character body limit.
  const prior=item.classification;
  const priorOpen=prior?.openCounterEvidence&&openCounter.test(normalize(prior.openCounterEvidence))&&!/ではない|対象外|を除く/.test(prior.openCounterEvidence);
  const description=item.descriptionText||item.summary||"";
  const extra=[prior?.openCounterEvidence,prior?.unifiedRequiredEvidence,prior?.unifiedEligibleEvidence,prior?.otherQualificationEvidence].filter((e):e is string=>!!e&&!normalize(description).includes(normalize(e)));
  return {...classifyProcurement({title:item.title||"",contractMethod:item.contractMethod||(priorOpen?"オープンカウンター":""),qualifications:item.qualifications,
    description:[description,...extra].join("。")}), municipal:isMunicipalProcurement(item)};
}
export function isMunicipalProcurement(item:ClassifiedNotice):boolean {
  const agency=normalize(item.agency||"");
  const national=/^(?:内閣|総務省|法務省|外務省|財務省|文部科学省|厚生労働省|農林水産省|経済産業省|国土交通省|環境省|防衛省|陸上自衛隊|海上自衛隊|航空自衛隊|警察庁|消防庁|海上保安庁|林野庁|国税庁|気象庁|デジタル庁|独立行政法人|国立大学法人|国立研究開発法人)/.test(agency);
  if(national)return false;
  if(/(?:都|道|府|県|市|区|町|村)(?:役所|役場|庁|立|教育委員会|上下水道|水道局|保健所|消防|病院|$)/.test(agency))return true;
  try { const host=new URL(item.officialUrl||"").hostname; return /(?:^|\.)(?:pref|city|town|vill)\./.test(host)||host.endsWith(".lg.jp"); } catch { return false; }
}
// Inclusion is a discovery decision, not a declaration of participation eligibility.
export function matchesParticipationScope(item:ClassifiedNotice,classification=currentClassification(item)):boolean {
  if(isMunicipalProcurement(item))return true;
  if(classification.otherQualificationEvidence)return false;
  return !!(classification.unifiedEligibleEvidence||classification.openCounterEvidence);
}
export function matchesResultCategory(item: ClassifiedNotice, category: ResultCategory, classification=currentClassification(item)): boolean {
  if(!matchesParticipationScope(item,classification))return false;
  if (category === "municipal") return isMunicipalProcurement(item);
  if (category === "open-counter") return !!classification.openCounterEvidence;
  if (category === "unified-required") return !!classification.unifiedEligibleEvidence;
  return true;
}
