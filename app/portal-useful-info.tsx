import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ExternalLink, Lightbulb } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from "@/components/ui/table";
import { articleUpdatedAt, getPortalArticle, portalArticles, portalReadingPages, type PortalArticle } from "@/lib/portal-articles";
import { pinnedPortalArticles } from "@/lib/portal-lark-articles";

function ArticleCover({ article, hero = false, priority = false }: { article: PortalArticle; hero?: boolean; priority?: boolean }) {
  return <span className={`column-cover${hero ? " column-cover--hero" : ""}${article.cover.design === "pr" ? " column-cover--pr" : ""}`} aria-hidden="true">
    <img src={article.cover.image} alt="" width={1672} height={941} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async"/>
    {article.cover.design !== "pr" && <span className="column-cover-copy"><span className="column-cover-brand">合同会社SFL</span><span className="column-cover-headline">{article.cover.lines.map(line => <span key={line}>{line}</span>)}</span><span className="column-cover-caption">官公庁の仕事を学ぶ</span></span>}
  </span>;
}

const ARTICLES_PER_PAGE = 3;
const columnPageHref = (page: number) => page === 1 ? "#useful-info" : `#useful-info?page=${page}`;

export default function PortalUsefulInfo({ articleId, page = 1 }: { articleId: string; page?: number }) {
  const article = getPortalArticle(articleId);
  const totalPages = Math.max(1, Math.ceil(portalArticles.length / ARTICLES_PER_PAGE));
  const currentPage = Math.min(totalPages, Math.max(1, Number.isSafeInteger(page) ? page : 1));
  const startIndex = (currentPage - 1) * ARTICLES_PER_PAGE;
  const visibleArticles = portalArticles.slice(startIndex, startIndex + ARTICLES_PER_PAGE);
  const readingPage = portalReadingPages[currentPage - 1];
  const articleIndex = article ? portalArticles.indexOf(article) : -1;
  const returnPage = articleIndex >= 0 ? Math.floor(articleIndex / ARTICLES_PER_PAGE) + 1 : currentPage;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    document.getElementById("workspace-main")?.scrollIntoView({ block: "start" });
  }, [articleId, currentPage]);

  if (article) return <article className="sfl-columns sfl-column-reader" aria-labelledby="column-title">
    <a href={columnPageHref(returnPage)} className="column-back"><ArrowLeft size={18}/>コラム一覧に戻る</a>
    <header className="column-article-header">
      <ArticleCover article={article} hero priority/>
      <span className="column-category">{article.category}</span>
      <h2 id="column-title" ref={headingRef} tabIndex={-1}>{article.title}</h2>
      <p className="column-byline">執筆・編集：合同会社SFL <span>更新：<time dateTime="2026-09-16">{articleUpdatedAt}</time></span></p>
      <p className="column-lead">{article.lead}</p>
    </header>
    <div className="column-keypoint"><Lightbulb size={23} aria-hidden="true"/><div><strong>この記事のポイント</strong><p>{article.takeaway}</p></div></div>
    <div className="column-reading-layout">
      <nav className="column-toc" aria-label="この記事の目次"><strong>この記事の内容</strong><ol>{article.sections.map((section, index) => <li key={section.heading}><button type="button" onClick={() => { const heading = document.getElementById(`column-section-${index}`); heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: "start" }); }}>{section.heading.replace(/^\d+\. /, "")}</button></li>)}</ol></nav>
      <div className="column-prose">
        {article.sections.map((section, index) => <section className="column-section" key={section.heading} aria-labelledby={`column-section-${index}`}>
          <h3 id={`column-section-${index}`} tabIndex={-1}>{section.heading}</h3>
          {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          {section.bullets && <ul>{section.bullets.map(item => <li key={item}>{item}</li>)}</ul>}
          {section.table && <Table className="column-detail-table">
            <TableCaption>{section.table.caption}</TableCaption>
            <TableHeader><TableRow>{section.table.columns.map(column => <TableHead key={column} scope="col">{column}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{section.table.rows.map((row, rowIndex) => <TableRow key={rowIndex}>{row.map((cell, cellIndex) => cellIndex === 0 ? <TableHead key={cellIndex} scope="row">{cell}</TableHead> : <TableCell key={cellIndex}>{cell}</TableCell>)}</TableRow>)}</TableBody>
          </Table>}
          {section.sourceIds && <div className="column-sources"><span>{article.kind === "lark" ? "機能・事例の確認先" : "制度・公的情報の確認先"}</span>{section.sourceIds.map(id => <a href={article.references[id].href} key={id} target="_blank" rel="noopener noreferrer">{article.references[id].label}<ExternalLink size={14} aria-hidden="true"/></a>)}</div>}
        </section>)}
        <aside className="column-sfl-point" aria-label="SFLの視点"><span>SFLの視点</span><p>{article.sflPoint}</p></aside>
        <section className="column-checklist" aria-labelledby="column-checklist-title"><h3 id="column-checklist-title">次に確認すること</h3><ul>{article.checklist.map(item => <li key={item}><Check size={19} aria-hidden="true"/><span>{item}</span></li>)}</ul></section>
        {article.cta && <aside className="column-lark-cta" aria-label="Larkの利用・講座のご案内"><img src="/lark-logo.png" alt="Lark" width={44} height={44}/><h3>{article.cta.title}</h3><p>{article.cta.body}</p><div className="column-cta-actions"><a className="useful-info-open" href={article.cta.primary.href} target="_blank" rel="noopener noreferrer">{article.cta.primary.label}<ArrowRight size={18} aria-hidden="true"/></a>{article.cta.secondary && <a className="column-cta-secondary" href={article.cta.secondary.href} target={article.cta.secondary.href.startsWith("https://") ? "_blank" : undefined} rel={article.cta.secondary.href.startsWith("https://") ? "noopener noreferrer" : undefined}>{article.cta.secondary.label}<ArrowRight size={16} aria-hidden="true"/></a>}</div></aside>}
        <footer className="column-article-footer"><p>{article.kind === "lark" ? "合同会社SFLが独自に執筆・編集しています。機能・料金の確認日：2026年9月16日。利用時にはLark公式の最新条件をご確認ください。" : "合同会社SFLが、案件選び・業務改善・研修の視点から執筆・編集しています。練習用のケース・記入例・試算はSFLが作成した仮定で、実際の募集、受注実績や効果を示すものではありません。制度・募集条件は最新の公告と公式資料でご確認ください。見出し画像はイメージです。"}</p>{article.kind === "lark" && <p>合同会社SFLはLark Japanの代理店ではありません。SFL Lark導入講座はSFL独自の有料講座です。Larkの無料プランとは別のサービスで、Lark公式講座ではありません。見出し画像はイメージです。</p>}<a href={article.themeReference.href} target="_blank" rel="noopener noreferrer">{article.kind === "lark" ? "関連案内：" : "テーマ参考："}{article.themeReference.label}<ExternalLink size={14} aria-hidden="true"/></a></footer>
        <a href={columnPageHref(returnPage)} className="useful-info-open column-return"><ArrowLeft size={18}/>コラム一覧に戻る</a>
      </div>
    </div>
  </article>;

  return <section className="sfl-columns useful-info-panel column-index" aria-labelledby="useful-info-heading">
    <header className="useful-info-heading"><BookOpen size={27} aria-hidden="true"/><div><span className="column-index-kicker">合同会社SFL</span><h2 id="useful-info-heading" ref={headingRef} tabIndex={-1}>Larkと官公庁の仕事を学ぶコラム集</h2></div><span className="column-count">全{pinnedPortalArticles.length + portalArticles.length}本</span></header>
    <div className="column-index-intro"><p>AI研修・IT・業務改善を、国の仕事へ。SFL作成の判断例と記入例で、案件選びから納品・入金確認までの進め方を学べます。</p><span>執筆・編集：合同会社SFL ／ 更新：{articleUpdatedAt}</span></div>
    {articleId && <p className="column-missing" role="status">指定された記事は見つかりませんでした。以下の一覧からお選びください。</p>}
    <section className="lark-featured" aria-labelledby="lark-featured-heading">
      <div className="lark-featured-heading"><img src="/lark-logo.png" alt="Lark" width={48} height={48}/><div><span>最初に読みたい、おすすめの3本</span><h3 id="lark-featured-heading">無料から始める、Larkで業務改善。</h3></div></div>
      <p className="lark-featured-intro">案件管理・資料・報連相、そして売上管理へ。SFLがLarkをおすすめする理由と、仕事での活かし方をご紹介します。</p>
      <div className="lark-featured-grid">{pinnedPortalArticles.map((item, index) => <a key={item.id} href={`#useful-info/${item.id}${currentPage > 1 ? `?page=${currentPage}` : ""}`} className="lark-featured-card"><ArticleCover article={item} priority={index === 0}/><div className="lark-featured-body"><span className="lark-featured-category">{String(index + 1).padStart(2, "0")} ／ {item.category}</span><h4>{item.title}</h4><p>{item.summary}</p><span className="lark-featured-read">記事を読む<ArrowRight size={18} aria-hidden="true"/></span></div></a>)}</div>
    </section>
    <div className="column-regular-heading"><h3>{currentPage}. {readingPage.title}</h3><p>{readingPage.description}</p></div>
    <p className="column-page-status" role="status">全{portalArticles.length}本中 {startIndex + 1}〜{startIndex + visibleArticles.length}本を表示<span>{currentPage} / {totalPages}ページ</span></p>
    <Table className="useful-info-table column-index-table" aria-label="合同会社SFLのコラム一覧">
      <TableHeader><TableRow><TableHead scope="col">テーマ・コラム</TableHead><TableHead scope="col">この記事で分かること</TableHead><TableHead scope="col"><span className="sr-only">記事を読む</span></TableHead></TableRow></TableHeader>
      <TableBody>{visibleArticles.map((item, index) => <TableRow key={item.id}>
        <TableHead scope="row"><span className="column-index-category">{String(startIndex + index + 1).padStart(2, "0")}<span>{item.category}</span></span><a href={`#useful-info/${item.id}`} className="column-index-link"><ArticleCover article={item} priority={index === 0}/><span className="column-index-title">{item.title}</span></a></TableHead>
        <TableCell>{item.summary}</TableCell>
        <TableCell><a className="useful-info-open" href={`#useful-info/${item.id}`} aria-label={`${item.title}を読む`}>記事を読む<ArrowRight size={17} aria-hidden="true"/></a></TableCell>
      </TableRow>)}</TableBody>
    </Table>
    {totalPages > 1 && <nav className="column-pagination" aria-label="コラム一覧のページ切り替え">
      {currentPage > 1 ? <a className="column-page-link" href={columnPageHref(currentPage - 1)} rel="prev"><ArrowLeft size={18} aria-hidden="true"/>前へ</a> : <span className="column-page-link" aria-disabled="true"><ArrowLeft size={18} aria-hidden="true"/>前へ</span>}
      {Array.from({ length: totalPages }, (_, index) => index + 1).map(number => <a key={number} className="column-page-link" href={columnPageHref(number)} aria-label={`${number}ページ目`} aria-current={number === currentPage ? "page" : undefined}>{number}</a>)}
      {currentPage < totalPages ? <a className="column-page-link" href={columnPageHref(currentPage + 1)} rel="next">次へ<ArrowRight size={18} aria-hidden="true"/></a> : <span className="column-page-link" aria-disabled="true">次へ<ArrowRight size={18} aria-hidden="true"/></span>}
    </nav>}
  </section>;
}
