"use client";
import BidWorkflowEditor from "./bid-workflow-editor";
import { type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, Check, LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { safePublicUrl, statuses, statusLabels, submittedStatuses, todayJst, type BidInput, type BidStatus, type Member } from "@/lib/bid-domain";

function Field({label,children,wide=false,hint}:{label:string;children:ReactNode;wide?:boolean;hint?:string}){return <label className={`form-field${wide?" full":""}`}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}

export default function BidEditorForm({draft,members,saving,error,onChange,onSave,onClose}:{
 draft:BidInput;members:Member[];saving:boolean;error:string;
 onChange:<K extends keyof BidInput>(key:K,value:BidInput[K])=>void;
 onSave:(event:FormEvent)=>void;onClose:()=>void;
}){
 return <form onSubmit={onSave} className="editor-form">
  <div className="editor-context"><span>＊は必須項目。その他は分かる範囲で入力し、後から追記できます。</span>{safePublicUrl(draft.officialUrl)&&<a className="button secondary" href={draft.officialUrl} target="_blank" rel="noopener noreferrer">公式公告を見る<ArrowUpRight size={16}/></a>}</div>
  {error&&<div className="app-error" role="alert">{error}</div>}
  <fieldset className="editor-section"><legend><span>01</span>公告の基本情報</legend><p>何の仕事か、どの機関の募集かを記録。</p><div className="form-grid">
   <Field label="案件名 *" wide><Input required autoFocus maxLength={250} value={draft.title} onChange={e=>onChange("title",e.target.value)}/></Field>
   <Field label="発注機関 *"><Input required maxLength={200} value={draft.agency} onChange={e=>onChange("agency",e.target.value)}/></Field>
   <Field label="都道府県・地域"><Input maxLength={150} value={draft.region} onChange={e=>onChange("region",e.target.value)}/></Field>
   <Field label="公式公告・仕様書URL" wide><Input type="url" maxLength={2000} value={draft.officialUrl} onChange={e=>onChange("officialUrl",e.target.value)} placeholder="https://"/></Field>
   <Field label="公告日"><Input type="date" value={draft.announcedOn} onChange={e=>onChange("announcedOn",e.target.value)}/></Field>
   <Field label="提出期限"><Input type="date" value={draft.deadline} onChange={e=>onChange("deadline",e.target.value)}/></Field>
   <Field label="業務概要" wide><Textarea rows={3} maxLength={6000} value={draft.summary} onChange={e=>onChange("summary",e.target.value)}/></Field>
  </div></fieldset>
  <fieldset className="editor-section"><legend><span>02</span>参加するための条件</legend><p>資格・予算・実施条件を確認して参加を判断。</p><div className="form-grid">
   <Field label="業務との適合度（担当者判断）"><NativeSelect value={draft.fit} onChange={e=>onChange("fit",e.target.value as BidInput["fit"])}><option value="A">A / 適合度高</option><option value="B">B / 要件確認</option><option value="C">C / 慎重判断</option></NativeSelect></Field>
   <Field label="契約方式"><Input maxLength={150} value={draft.contractMethod} onChange={e=>onChange("contractMethod",e.target.value)}/></Field>
   <Field label="予算・予定価格"><Input maxLength={200} value={draft.budget} onChange={e=>onChange("budget",e.target.value)} placeholder="例：500,000円（税込）／記載なし"/></Field>
   <Field label="参加資格・条件" wide hint="応募する名義の資格・等級・地域要件を、公告原文で確認してください。"><Textarea rows={2} maxLength={2000} value={draft.qualifications} onChange={e=>onChange("qualifications",e.target.value)}/></Field>
   <Field label="対応できる理由" wide><Textarea rows={2} maxLength={2500} value={draft.matchReason} onChange={e=>onChange("matchReason",e.target.value)}/></Field>
   <Field label="懸念点・要確認事項" wide><Textarea rows={2} maxLength={3000} value={draft.concerns} onChange={e=>onChange("concerns",e.target.value)}/></Field>
  </div></fieldset>
  <fieldset className="editor-section"><legend><span>03</span>担当・進捗・提出</legend><p>担当者と次の作業を決め、提出後に実績を記録。</p><div className="form-grid">
   <Field label="対応状況"><NativeSelect value={draft.status} onChange={e=>onChange("status",e.target.value as BidStatus)}>{statuses.map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</NativeSelect></Field>
   <Field label="担当者"><NativeSelect value={draft.assignee} onChange={e=>onChange("assignee",e.target.value)}><option value="">未割当</option>{members.map(m=><option value={m.email} key={m.email}>{m.name}</option>)}{draft.assignee&&!members.some(m=>m.email===draft.assignee)&&<option value={draft.assignee}>{draft.assignee}（未登録）</option>}</NativeSelect></Field>
   <Field label={`提出日${submittedStatuses.includes(draft.status)?" *":""}`} hint="実際に提出した日。週・月の実績に反映します。"><Input type="date" required={submittedStatuses.includes(draft.status)} max={todayJst()} value={draft.submittedOn} onChange={e=>onChange("submittedOn",e.target.value)}/></Field>
   <Field label="次にすること・対応メモ" wide hint="例：仕様書を確認 → 見積作成 → 担当者へ送付"><Textarea rows={4} maxLength={10000} value={draft.notes} onChange={e=>onChange("notes",e.target.value)}/></Field>
  </div></fieldset>
  <BidWorkflowEditor draft={draft} onChange={value=>onChange("workflow",value)}/>
  <div className="editor-actions"><button className="button secondary" type="button" disabled={saving} onClick={onClose}>閉じる</button><button className="button primary" type="submit" disabled={saving}>{saving?<LoaderCircle className="spin" size={18}/>:<Check size={18}/>}案件を保存</button></div>
 </form>;
}
