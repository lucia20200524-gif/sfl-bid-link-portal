"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ArrowUpRight, ChevronRight, LoaderCircle, Plus, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { currentClassification, matchesParticipationScope, participationScopeNotice, matchesResultCategory, resultCategories, type ResultCategory } from "@/lib/procurement-classification";
import { dateOffset, displayDate, todayJst } from "@/lib/bid-domain";
import { isFutureBidDeadline } from "@/lib/procurement-deadline";
import { procurementSource, type ProcurementSourceId } from "@/lib/procurement-sources";
import type { ProcurementCandidate, ProcurementResult } from "@/lib/procurement-search";
import type { LarkMode } from "@/lib/collection-profiles";
import { larkCandidateIdentity } from "@/lib/lark-registration";
import { LarkRegistrationAction, useLarkRegistration } from "./lark-registration";
import { defenseBrowserRules, isDefenseBrowserSource } from "@/lib/defense-browser-rules";

export type CollectedCandidate = ProcurementCandidate;
export type CollectionResult = ProcurementResult;

export default function CollectionTable({ result, loading, error, onRegister, onOpenCollection, contextLabel, mode = "sfl", sourceId = "kkj", category = "all", onCategoryChange }: {
  result: CollectionResult;
  loading: boolean;
  error: string;
  onRegister: (item: CollectedCandidate) => void;
  onOpenCollection?: () => void;
  contextLabel?: string;
  mode?: LarkMode;
  sourceId?: ProcurementSourceId;
  category?: ResultCategory;
  onCategoryChange?: (category: ResultCategory) => void;
}) {
  const headingId = useId();
  const [query,setQuery]=useState("");
  const [source,setSource]=useState("");
  const lark = useLarkRegistration(mode, result.items);
  const selected = procurementSource(result.search?.sourceId ?? sourceId);
  const partial = result.sources.some(source => source.status === "partial");
  const searchedOn = result.search?.searchedOn ?? (result.collectedAt ? todayJst(new Date(result.collectedAt)) : todayJst());
  const eligible = result.items.map(item=>({...item,classification:currentClassification(item)})).filter(item=>isFutureBidDeadline(item.deadline,searchedOn)&&matchesParticipationScope(item,item.classification));
  const search=query.trim().normalize("NFKC").toLowerCase();
  const visible=eligible.filter(item=>matchesResultCategory(item,category)&&(!source||item.source===source)&&(!search||[item.title,item.agency,item.prefecture,item.region,item.summary,...item.matchedKeywords].join(" ").normalize("NFKC").toLowerCase().includes(search)));
  const counts = Object.fromEntries(resultCategories.map(tab=>[tab.id,eligible.filter(item=>matchesResultCategory(item,tab.id)).length]));
  const categoryLabel = resultCategories.find(tab=>tab.id===category)!.label;
  const resetFilters = () => { setQuery(""); setSource(""); onCategoryChange?.("all"); };
  const failedSources = result.sources.filter(source => source.status === "failed").length;
  const allFailed = result.sources.length > 0 && failedSources === result.sources.length;
  const attempted = !!result.collectedAt || result.sources.length > 0;
  const emptyTitle = loading ? `${selected.name}を対象に案件を検索中です` : error || allFailed ? "検索を完了できませんでした" : attempted ? "未来の入札締切日を確認できる案件はありませんでした" : "まだ検索していません";
  const emptyDescription = error || allFailed ? "案件が0件という意味ではありません。時間をおいて再検索してください。" : partial ? "検索先全体が0件という意味ではありません。締切不明の案件も除外しています。語句を変えるか、公式サイトでも確認してください。" : attempted ? "当日締切・期限切れ・締切不明の案件は表示していません。短いキーワードで再検索するか、公式サイトでも確認してください。" : "検索キーワードと検索先を選ぶと、検索結果をここに表示します。";

  if (isDefenseBrowserSource(selected.id) && result.method !== "official-browser") {
    const rule = defenseBrowserRules[selected.id];
    return <section id={`collection-results-${mode}`} tabIndex={-1} className="panel collection-external-result defense-browser-results" data-mode={mode} data-search-method="official-browser" aria-labelledby={headingId}>
      <h2 id={headingId}>調査結果一覧</h2><p><strong>{contextLabel} · {selected.name}</strong></p>
      <p className="defense-browser-status" role="status">ブラウザー検索：まだ結果を取得していません</p>
      <p>「{rule.title}」の{rule.targets.length}{rule.targetUnit}を確認する設定です。検索を開始すると、確認済みの案件をここに表示します。案件が0件という意味ではありません。</p>
      {error&&<p className="app-error" role="alert">{error}</p>}
      {onOpenCollection&&<button type="button" className="text-button" onClick={onOpenCollection}>検索ルールと確認先を見る<ChevronRight size={17}/></button>}
    </section>;
  }
  if (!selected.automatic && !isDefenseBrowserSource(selected.id)) return <section id={`collection-results-${mode}`} tabIndex={-1} className="panel collection-external-result" aria-labelledby={headingId}><h2 id={headingId}>調査結果一覧</h2><p><strong>{contextLabel} · {selected.name}</strong></p><p role="status"><strong>自動検索・取り込みは準備中です</strong></p><p>案件が0件という意味ではありません。{selected.name}のサイトで検索・確認できます。</p><a className="button secondary" href={selected.href} target="_blank" rel="noopener noreferrer">{selected.name}を開く<ArrowUpRight size={17}/></a>{onOpenCollection&&<button type="button" className="text-button" onClick={onOpenCollection}>案件を探す<ChevronRight size={17}/></button>}</section>;

  return <section id={`collection-results-${mode}`} tabIndex={-1} className="panel table-panel collection-results" data-mode={mode} aria-labelledby={headingId} aria-busy={loading}>
    <div className="collection-results-heading">
      <div>
        <div className="collection-results-title"><h2 id={headingId}>{!onOpenCollection&&<span className="search-step" aria-hidden="true">03</span>}調査結果一覧</h2><span className="collection-count" role="status">{loading ? "検索中…" : error ? "検索未完了" : attempted ? `${partial ? "取得範囲内：" : ""}${visible.length}件表示 / ${eligible.length}件取得` : "未検索"}</span></div>
        <p>{contextLabel&&<><strong>{contextLabel}</strong> · </>}{result.collectedAt ? <>最終検索：<time dateTime={result.collectedAt}>{new Date(result.collectedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</time>（日本時間）</> : "検索した案件を1件ずつ表示します。"}</p>
        {result.search&&<p>検索条件：{result.search.scope==="title"?"件名のみ":"件名・公告本文"} · 入札締切 {displayDate(dateOffset(searchedOn,1))}以降（日本時間）</p>}
        <p className="collection-selected-source">検索先：<strong>{selected.name}</strong> · {result.method==="official-browser"?"公式ページ・公告資料の確認分":"官公需情報ポータル収録分"}</p>
        {result.search&&<details className="searched-keywords"><summary>検索したキーワード（{result.search.keywords.length}語）</summary><p>{result.search.keywords.join("、")}</p></details>}
      </div>
      {onOpenCollection && <button type="button" className="text-button" onClick={onOpenCollection}>案件を探す<ChevronRight size={17}/></button>}
    </div>
    <div className="collection-lark-target"><span>Lark登録先：{lark.destination ? <a href={lark.destination.url} target="_blank" rel="noopener noreferrer">{lark.destination.name}<ArrowUpRight size={16}/></a> : <a href="#settings">接続設定を確認</a>}</span>{lark.checking ? <span role="status">登録状況を確認中…</span> : lark.message && <span role="status">{lark.message}<button className="text-button" type="button" onClick={lark.refresh}>再確認</button></span>}</div>
    {eligible.length > 0 && (loading || error || failedSources > 0) && <p className="collection-results-notice" role="status">{loading ? result.method==="official-browser"?"確認できた案件から順に表示しています。":"再検索中です。前回の検索結果を表示しています。" : error ? "検索できなかったため、前回の検索結果を表示しています。" : "取得できた案件を表示しています。"}</p>}
    {result.recommendation&&<div className="collection-recommendation" role="status"><strong>おすすめを表示（最大{result.recommendation.limit}件）</strong><p>検索データが多いため、取得件数を自動調整しました。取得できた案件の中から、未来の締切が確認できた候補を選んでいます。</p><p>{result.recommendation.basis}</p></div>}
    {result.scopeNotice&&<p className="collection-results-notice" role="status">{result.scopeNotice}</p>}
    {result.deadlineStats&&<p className="collection-deadline-summary">締切の確認結果：<strong>未来 {result.deadlineStats.future}件</strong> · 当日・期限切れ {result.deadlineStats.closed}件 · 不明 {result.deadlineStats.unknown}件<span>未来の締切が確認できた案件だけを表示しています。</span></p>}
    {!!result.skippedCount&&<p className="collection-table-note">重複や有効なリンクがない{result.skippedCount}件を一覧から除いています。</p>}
    <Tabs value={category} onValueChange={value=>onCategoryChange?.(value as ResultCategory)} className="result-category-root">
    <div className="result-category-heading">
      <TabsList className="result-category-tabs" aria-label={`${contextLabel||"調査結果"}の契約方式・参加資格`}>
        {resultCategories.map(tab=><TabsTrigger value={tab.id} data-category={tab.id} key={tab.id}>{tab.label}<span className="result-category-count">{attempted||eligible.length ? counts[tab.id] : "—"}</span></TabsTrigger>)}
      </TabsList>
      <p className="result-category-help">{participationScopeNotice}</p>
      <details className="result-category-details"><summary>分類の見方</summary><p>「全省庁統一資格対象」は、公告本文に統一資格を利用できる条件がある案件です。統一資格が選択肢の一つとして認められる場合も含みます。自動判定のため、参加前に原文で条件を確認してください。両方に該当する案件は両方に表示されます。オープンカウンターであっても資格不要とは限りません。件数は今回取得した案件の内訳です。</p></details>
    </div>
    {resultCategories.map(tab=><TabsContent value={tab.id} key={tab.id} className="result-category-content">{category===tab.id&&<>
    <p className="result-category-status" role="status">選択中：{categoryLabel}{eligible.length>0&&` · ${visible.length}件表示`}</p>
    {eligible.length>0&&<div className="collection-table-filters"><label className="search-input"><Search size={17}/><Input value={query} onChange={e=>setQuery(e.target.value)} aria-label="調査結果を絞り込み" placeholder="結果の中から案件名・語句で絞り込み"/></label><NativeSelect aria-label="掲載元で絞り込み" value={source} onChange={e=>setSource(e.target.value)}><option value="">すべての掲載元</option>{[...new Set(eligible.map(item=>item.source))].map(value=><option value={value} key={value}>{value}</option>)}</NativeSelect>{(query||source)&&<button className="text-button" onClick={()=>{setQuery("");setSource("");}}>解除</button>}</div>}
    <div className="collection-table-scroll" role="region" aria-label="調査結果一覧" tabIndex={0}>
      <Table className="collection-table" aria-label="調査結果一覧" role="table">
        <TableHeader role="rowgroup"><TableRow role="row">
          <TableHead scope="col">都道府県</TableHead>
          <TableHead scope="col">種別管理</TableHead>
          <TableHead scope="col">案件先機関名</TableHead>
          <TableHead scope="col">案件先URL</TableHead>
          <TableHead scope="col">提出期限</TableHead>
          <TableHead scope="col">Larkへ登録</TableHead>
        </TableRow></TableHeader>
        <TableBody role="rowgroup">
          {visible.map((item) => <TableRow key={item.id} role="row">
            <TableCell role="cell" data-label="都道府県"><span>{item.prefecture || "要確認"}</span></TableCell>
            <TableCell role="cell" data-label="種別管理" className="collection-type-cell">
            <div className="result-item-categories">{item.classification?.openCounterEvidence&&<span className="category-open-counter">オープンカウンター</span>}{item.classification?.unifiedRequiredEvidence&&<span className="category-unified-required">全省庁統一資格必須</span>}{!item.classification?.unifiedRequiredEvidence&&item.classification?.unifiedEligibleEvidence&&<span className="category-unified-required">全省庁統一資格対象</span>}</div>
            {(item.classification?.openCounterEvidence||item.classification?.unifiedEligibleEvidence)&&<details className="result-evidence"><summary>分類の根拠を見る</summary>{item.classification.openCounterEvidence&&<p><strong>契約方式の記載</strong>{item.classification.openCounterEvidence}</p>}{item.classification.unifiedEligibleEvidence&&<p><strong>参加資格の記載</strong>{item.classification.unifiedEligibleEvidence}</p>}</details>}
            </TableCell>
            <TableCell role="cell" data-label="案件先機関名"><strong className="collection-agency">{item.agency || "要確認"}</strong>{item.region&&item.region!==item.prefecture&&<p className="collection-region">{item.region}</p>}</TableCell>
            <TableCell role="cell" data-label="案件先URL" className="collection-main-cell">
              <a className="collection-item-title collection-official-link" href={item.officialUrl} target="_blank" rel="noopener noreferrer" aria-label={`${item.title}の公式ページを開く（新しいタブ）`}>{item.title}<ArrowUpRight size={18}/></a>
              <span className="collection-url">{item.officialUrl}</span>
              {result.recommendation&&<p className="collection-recommendation-match">{item.matchLocation==="title"?"件名に一致":item.matchLocation==="body"?"公告本文に一致":"検索先で条件に一致"}{item.matchedKeywords.length>0&&` · 一致キーワード ${item.matchedKeywords.length}語`}</p>}
              <details className="collection-research-details"><summary>調査内容を見る</summary>
                {item.indexedDate&&<small className="cell-secondary">公告・取得日：{displayDate(item.indexedDate)}</small>}
                {item.summary && !item.summary.startsWith("公開ページ上でキーワードに一致した候補です。") && <p className="collection-item-summary"><span className="excerpt-label">公告本文の抜粋</span>{item.summary}</p>}
                {(item.matchLocation||item.matchedKeywords.length>0)&&<div className="collection-match-details"><p>{item.matchLocation==="title"?"件名に一致":item.matchLocation==="body"?"公告本文に一致":"検索先で条件に一致"}{item.matchedKeywords.length>0&&` · 一致キーワード ${item.matchedKeywords.length}語`}</p><div className="collection-keywords">{item.matchedKeywords.map(keyword => <span key={keyword}>{keyword}</span>)}</div></div>}
              </details>
            </TableCell>
            <TableCell role="cell" data-label="提出期限"><span className={item.deadline ? "collection-date" : "collection-unconfirmed"}>{displayDate(item.deadline)}</span>{item.deadlineEvidence&&<details className="result-evidence"><summary>締切の記載</summary><p>{item.deadlineEvidence}</p></details>}</TableCell>
            <TableCell role="cell" data-label="Larkへ登録" className="collection-lark-cell"><LarkRegistrationAction destination={lark.destination} mode={mode} item={item} state={lark.rows[larkCandidateIdentity(item)]} disabled={!lark.configured || lark.checking || loading} onRegister={()=>void lark.register(item)}/><button className="text-button portal-register-button" type="button" onClick={()=>onRegister(item)} aria-label={`${item.title}を案件に登録`}><Plus size={16}/>ポータルに登録</button></TableCell>
          </TableRow>)}

        </TableBody>
      </Table>
    </div>
    {!visible.length&&<div className="collection-empty-cell"><div role="status">{loading&&<LoaderCircle className="spin" size={24}/>}<strong>{eligible.length?`「${categoryLabel}」の条件に合う案件がありません`:emptyTitle}</strong><p>{eligible.length?category!=="all"?"今回取得した案件の中に、該当する記載を確認できませんでした。「すべて」で未判定の案件も確認できます。":"絞り込み条件を解除して確認してください。":loading?result.method==="official-browser"?"確認できた案件から順に表示します。確認先ごとの進捗は検索欄で確認できます。":"検索が完了すると、案件を一覧に表示します。最大1分ほどかかることがあります。":emptyDescription}</p>{(query||source||category!=="all")&&<button className="button secondary" onClick={resetFilters}>すべての結果を表示</button>}</div></div>}
    </>}</TabsContent>)}
    </Tabs>
    {result.method==="official-browser"?<p className="collection-table-note">指定先の公式ページと公告資料から、未来の提出期限を確認できた案件を表示しています。全案件を網羅するものではありません。締切の変更・参加条件は原文で確認してください。</p>:<p className="collection-table-note"><a href="https://www.kkj.go.jp/s/" target="_blank" rel="noopener noreferrer">官公需情報ポータル</a>の検索APIを利用しています。取得した公告本文に、検索日より未来の入札書・見積書・提案書の提出期限が明記された案件だけを表示します。すべての公告を網羅するものではありません。締切の変更や参加条件は原文で確認してください。</p>}
  </section>;
}
