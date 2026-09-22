"use client";

import { useId, type ReactNode } from "react";
import { ArrowUpRight, CalendarCheck, Copy, ListPlus, LoaderCircle, Search, Tags } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { keywordGroups } from "@/lib/portal-content";
import { collectionModes } from "@/lib/collection-profiles";
import { generateSearchKeywords } from "@/lib/keyword-generation";
import { procurementSource, procurementSources, type ProcurementSourceId } from "@/lib/procurement-sources";
import type { SearchScope } from "@/lib/procurement-search";
import { isDefenseBrowserSource } from "@/lib/defense-browser-rules";
import DefenseBrowserControl from "./defense-browser-control";
import type { ProcurementResult } from "@/lib/procurement-search";

export type CollectionSearchFields = { keyword: string; keywordGroup: string; sourceId: ProcurementSourceId; scope: SearchScope };

function SearchField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}</label>;
}

export default function CollectionSearchForm({ mode, fields, loading, anyCollecting, error, message, onChange, onGenerate, onSubmit, onKeywords, onCopyKeywords,onBrowserResult,onBrowserBusy }: {
  mode: typeof collectionModes[number]; fields: CollectionSearchFields;
  loading: boolean; anyCollecting: boolean; error: string; message?: string;
  onChange: (patch: Partial<CollectionSearchFields>) => void;
  onGenerate: () => void; onSubmit: () => void; onKeywords: () => void; onCopyKeywords: () => void;
  onBrowserResult?: (result:ProcurementResult)=>void;onBrowserBusy?:(busy:boolean)=>void;
}) {
  const id = useId();
  const selected = procurementSource(fields.sourceId);
  const browserSource = isDefenseBrowserSource(fields.sourceId) ? fields.sourceId : null;
  const generated = generateSearchKeywords(mode.id, fields.keywordGroup);
  return <section className="panel collection-panel" data-mode={mode.id}><form onSubmit={event => { event.preventDefault(); if (selected.automatic) onSubmit(); }}>
    <div className="search-builder">
    <div className="search-keyword-column">
    <div className="collection-search-heading"><div><h2><span className="search-step" aria-hidden="true">01</span>どんな仕事を探しますか？</h2><p className="section-description">{mode.description}</p></div><button type="button" className="text-button" onClick={onKeywords}>検索キーワード集<Tags size={16}/></button></div>
    <div className="keyword-generator">
      <SearchField label="自動生成するキーワードの分野"><NativeSelect value={fields.keywordGroup} onChange={event => onChange({ keywordGroup: event.target.value })} disabled={loading}><option value="recommended">このタブ向けのキーワード</option>{keywordGroups.map(group => <option key={group.title} value={group.title}>{group.title}</option>)}</NativeSelect></SearchField>
      <button type="button" className="button secondary generate-keywords" onClick={onGenerate} disabled={loading || !generated.count}><ListPlus size={19}/>キーワード集から自動生成<span className="generated-keyword-count">{generated.count}語</span></button>
      <p>迷ったら自動生成。入力した語句は自由に編集できます。</p>
    </div>
    <SearchField label="検索キーワード"><Textarea id={`collection-keywords-${mode.id}`} rows={3} className="collection-keyword-input" maxLength={1000} value={fields.keyword} disabled={loading} onChange={event => onChange({ keyword: event.target.value })} placeholder={mode.placeholder}/></SearchField>
    <p className="form-hint">読点「、」や改行で区切ると、いずれかの語句に一致する候補を探します（最大50語）。</p>
    <div className="search-presets"><span>よく探す仕事</span>{mode.presets.map(preset => <button type="button" key={preset.label} disabled={loading} aria-pressed={fields.keyword === preset.value} onClick={() => onChange({ keyword: preset.value })}>{preset.label}</button>)}</div>
    {(selected.automatic || browserSource) && <div className="collection-search-options"><SearchField label="検索範囲"><NativeSelect value={fields.scope} disabled={loading} onChange={event => onChange({ scope: event.target.value as SearchScope })}><option value="fulltext">件名・公告本文から探す</option><option value="title">件名だけで絞り込む</option></NativeSelect></SearchField></div>}
    </div>
    <fieldset id={`collection-sources-${mode.id}`} tabIndex={-1} className="collection-source-picker"><legend id={`${id}-sources`}><span className="search-step" aria-hidden="true">02</span>どこで探しますか？</legend><p id={`${id}-source-help`}>{procurementSources.length}つの検索先から1つ選択してください。</p>
      <RadioGroup value={fields.sourceId} onValueChange={value => onChange({ sourceId: value as ProcurementSourceId })} disabled={loading} aria-labelledby={`${id}-sources`} aria-describedby={`${id}-source-help`} className="collection-source-options">
        {procurementSources.map(source => <label key={source.id} htmlFor={`${id}-${source.id}`} className={`collection-source-option${fields.sourceId === source.id ? " selected" : ""}`}>
          <RadioGroupItem value={source.id} id={`${id}-${source.id}`}/><span><strong>{source.name}</strong><small>{isDefenseBrowserSource(source.id) ? "公式ページをブラウザー検索" : source.automatic ? "一覧に表示" : "自動検索：準備中"}</small></span>
        </label>)}
      </RadioGroup>
      <p className={`selected-source-description${selected.automatic ? "" : " external"}`} role="status"><strong>選択中：{selected.name}</strong>{selected.coverage}</p>
    </fieldset>
    </div>
    <div className="collection-deadline-rule"><CalendarCheck size={22}/><div><strong>入札締切日：検索日の翌日以降</strong><p>{browserSource ? "個別公告・添付資料で提出締切を確認するルールです。入札日時・開札日・納期で代用せず、締切不明の案件は表示対象にしません。" : selected.automatic ? "日本時間で判定。当日締切・期限切れ・締切不明の案件は表示しません。" : "公式サイトで入札締切日が翌日以降の案件を確認してください。検索条件は自動では引き継がれません。"}</p></div><span>全タブ共通</span></div>
    {browserSource && <DefenseBrowserControl key={`${mode.id}-${browserSource}`} mode={mode.id} sourceId={browserSource} keywords={fields.keyword} scope={fields.scope} anyCollecting={anyCollecting} onResult={result=>onBrowserResult?.(result)} onBusy={value=>onBrowserBusy?.(value)}/>}
    {selected.automatic ? <>
      <div className="collection-submit-row"><p className="collection-scope">未来の締切が確認できた案件を、締切が近い順に最大100件表示します。検索データが多い場合は、取得範囲内のおすすめ最大20件に自動で切り替えます。各サイトの全案件を直接検索するものではありません。</p><button className="button primary" type="submit" disabled={anyCollecting || !fields.keyword.trim()}>{loading ? <LoaderCircle className="spin" size={19}/> : <Search size={19}/>} {loading ? "検索中…" : anyCollecting ? "ほかのタブで検索中" : "案件を検索"}</button></div>
    </> : !browserSource && <div className="external-source-actions"><button type="button" className="button secondary" onClick={onCopyKeywords} disabled={!fields.keyword.trim()}><Copy size={18}/>検索語をコピー</button><a className="button primary" href={selected.href} target="_blank" rel="noopener noreferrer">{selected.name}を開いて検索<ArrowUpRight size={18}/></a></div>}
    {error && <div className="app-error" role="alert">{error}</div>}{message && !error && !loading && <p className="collection-message neutral" role="status">{message}</p>}
  </form></section>;
}
