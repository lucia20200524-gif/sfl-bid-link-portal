"use client";
import { discoveryPageSize } from "@/lib/discovery-domain";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, CodeXml, FileText, Printer } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { defenseBrowserRules } from "@/lib/defense-browser-rules";
import { browserLimits } from "@/lib/defense-browser-types";
import { gsdfProcurementCatalog } from "@/lib/gsdf-procurement-catalog";
import { msdfProcurementCatalog } from "@/lib/msdf-procurement-catalog";
import { asdfProcurementCatalog } from "@/lib/asdf-procurement-catalog";

const chapters = [
  ["overview", "全体像・ChatGPTとの関係"], ["stack", "システム構成・技術スタック"],
  ["sources", "取得先と巡回経路"], ["collection", "案件取得・解析・制限"],
  ["search", "検索・資格条件・要点カード"], ["storage", "保存データと共有範囲"],
  ["lark", "Lark Base登録の仕様"], ["notifications", "案件通知・週次通知・定期収集"],
  ["api", "API・認証・環境変数"], ["operations", "障害対応・監視・保守"],
  ["handover", "開発・公開・検証手順"], ["next", "面談で決めること・未実装項目"],
] as const;
function jump(id: string) { const target=document.getElementById(id);target?.scrollIntoView({behavior:"auto",block:"start"});target?.focus({preventScroll:true}); }
function SpecTable({ label, headers, rows }: { label: string; headers: string[]; rows: ReactNode[][] }) {
  return <div className="engineer-table"><Table aria-label={label}><TableHeader><TableRow>{headers.map(header=><TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row,i)=><TableRow key={i}>{row.map((cell,j)=><TableCell key={j}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table></div>;
}
function Section({ id, number, title, files, children }: { id: string; number: string; title: string; files: string[]; children: ReactNode }) {
  return <section id={`engineer-${id}`} tabIndex={-1} className="engineer-section"><header><span>{number}</span><h2>{title}</h2></header><div className="engineer-section-body">{children}</div><p className="engineer-evidence"><b>実装の参照先</b>{files.map(file=><code key={file}>{file}</code>)}</p></section>;
}
function Note({ title, children }: { title: string; children: ReactNode }) { return <aside className="engineer-note"><strong>{title}</strong><div>{children}</div></aside>; }

export default function EngineerSpec() {
  return <article className="engineer-spec" aria-label="エンジニア向け技術仕様書">
    <header id="engineer-document-top" tabIndex={-1} className="engineer-document-header"><div><p className="eyebrow">ENGINEERING HANDOVER</p><h2><CodeXml aria-hidden="true"/>入札リンクポータル 技術仕様書</h2><p>合同会社SFL / LUCIA · 面談・開発引き継ぎ用</p><p className="engineer-document-date">更新：2026年9月18日 · 実装基準：会員ID・パスワード認証を反映</p></div><div className="engineer-toolbar"><button type="button" className="button primary" onClick={()=>window.print()}><Printer size={19}/>印刷 / PDF保存</button></div></header>
    <div className="engineer-summary"><FileText size={23} aria-hidden="true"/><p><strong>この資料の読み方</strong> 現行コードと公開設定から確認した仕様をまとめています。外部サービスの設定・稼働状況はコードだけでは確定できないため、「運用記録」「要確認」を区別しています。APIキー・秘密鍵・個別の接続トークンは掲載していません。</p></div>
    <nav className="engineer-toc" aria-label="仕様書の目次"><h3>確認したい章へ</h3><ol>{chapters.map(([id,title],i)=><li key={id}><button type="button" onClick={()=>jump(`engineer-${id}`)}><span>{String(i+1).padStart(2,"0")}</span>{title}<ArrowDown size={15} aria-hidden="true"/></button></li>)}</ol></nav>

    <Section id="overview" number="01" title="全体像・ChatGPTとの関係" files={["worker/index.ts","app/bid-app.tsx",".openai/hosting.json","lib/guest-session.ts"]}>
      <p>官公庁・自衛隊の公開公告を取得し、ポータルの共有データベースに保存します。利用者は検索・資格条件の確認を行い、選んだ案件をLark Baseへ登録します。検索画面の「SFL専用・エンジニア専用・Academy専用」は、共有する収集結果に対して初期キーワードとLark登録先を切り替える区分です。</p>
      <SpecTable label="ChatGPTとポータルの役割" headers={["項目","現在の仕様"]} rows={[
        ["制作・公開管理","ChatGPTのSitesでソースを編集し、保存した版を公開する。所有者のSitesプロジェクトとして管理される。"],
        ["利用時の実行場所","公開URLのWebアプリとしてCloudflare Workers上で動作する。画面は利用者のブラウザで実行される。"],
        ["ChatGPTアカウント","会員は専用のID・パスワードでログイン。管理者はSitesのChatGPT認証を使用。公開ガイドはログイン不要。"],
        ["ChatGPT / OpenAI API","検索・本文解析・言い換え・要点カード・Lark登録の現行コードに、OpenAI APIを呼ぶ処理はない。ナビゲーターも定義済みの案内文で動く。"],
        ["所有者アカウントへの依存","利用者のChatGPTログインは不要だが、Sitesでの編集・公開・契約管理はプロジェクトの所有・編集権限に依存する。移管時はソースだけでなく運用権限も確認する。"],
      ]}/>
      <Note title="面談で最初に伝えること"><p>ChatGPTで制作したWebアプリですが、通常の案件検索を小寺さんのChatGPT会話に代行させる構成ではありません。稼働に必要なのは、公開サイト、D1保存先、外部取得先、Larkアプリの接続です。</p></Note>
    </Section>

    <Section id="stack" number="02" title="システム構成・技術スタック" files={["package.json","vite.config.ts","worker/index.ts","db/schema.ts","build/sites-vite-plugin.ts"]}>
      <div className="engineer-architecture" aria-label="システムの接続構成"><div className="architecture-node"><b>利用者のブラウザ</b><span>React画面・検索操作・案件確認</span></div><div className="architecture-connector">HTTPS / 同一サイトのAPI</div><div className="architecture-node architecture-server"><b>Sitesで公開したCloudflare Worker</b><span>vinext · 検索 / 収集 / 資格照合 / Lark登録</span></div><div className="architecture-services"><div><b>Cloudflare D1</b><span>候補・収集キュー・履歴・登録状態を読み書き</span></div><div><b>公開情報の取得先</b><span>官公需API / 防衛省・自衛隊のHTMLとPDFを取得</span></div><div><b>Lark Open API</b><span>既存レコード照合 / 選択案件の新規登録</span></div></div></div>
      <SpecTable label="技術スタック" headers={["層","採用技術・役割"]} rows={[
        ["画面","React 19.2.6 / TypeScript 5.9.3。Next.js App Router形式のappディレクトリ。メイン画面はURLハッシュで切り替える。"],
        ["実行・ビルド","vinext 0.0.50 / Vite 8.0.13。Next.js 16.2.6が依存にあるが、本番はvinextが生成するWorkerエントリで動作する。"],
        ["UI","Tailwind CSS 4.2.1、shadcn系コンポーネント / Radix UI、Lucideアイコン。女性・男性の配色、文字サイズ、左メニュー幅に対応。"],
        ["保存・スキーマ","Cloudflare D1（SQLite系）。バインディング名DB。Drizzle ORM 0.45.2でスキーマ・マイグレーションを管理し、主要な検索・保存ではprepare/bindによるSQLを実行。"],
        ["検証・解析","Zod 3.25.76で入力検証、linkedom 0.18.13でHTML解析、unpdf 1.8.1で文字入りPDFをページ順に解析。"],
        ["任意の画面描画","Cloudflare Browser Rendering REST API。通常HTTPで文字が得られず、JavaScript描画が必要と判断したページで接続設定がある場合に利用。"],
        ["ファイル保存","R2は未設定。公告PDFそのものをR2へ保管する構成ではなく、抽出した本文・根拠・URLをD1へ保存する。"],
      ]}/><p className="engineer-small">バージョンは今回確認したpackage.jsonの記載です。アップデート時はpackage-lock.jsonと動作検証を合わせて更新します。</p>
    </Section>

    <Section id="sources" number="03" title="取得先と巡回経路" files={["lib/discovery-collector.ts","lib/defense-browser-rules.ts","lib/gsdf-procurement-catalog.ts","lib/msdf-procurement-catalog.ts","lib/asdf-procurement-catalog.ts","lib/procurement-exclusions.ts"]}>
      <SpecTable label="検索先の役割と入口" headers={["取得先","方法・入口","対象の考え方"]} rows={[
        ["官公需情報ポータル",<><code>https://www.kkj.go.jp/api/</code><br/>HTTP GET / XML応答</>,"検索語をORでAPIへ渡し、応答の件名・発注機関・本文・原文URL等を解析して保存する。"],
        ["防衛省内局",<code>https://www.mod.go.jp/j/budget/chotatsu/naikyoku/mitsumori/index.html</code>,"見積募集の掲載欄と公告リンクを解析する。画面の防衛省フィルターには陸・海・空自衛隊も含む。"],
        ...(["gsdf","msdf","asdf"] as const).map(id=>[id==="gsdf"?"陸上自衛隊":id==="msdf"?"海上自衛隊":"航空自衛隊",<code key={id}>{defenseBrowserRules[id].entryUrl}</code>,`${defenseBrowserRules[id].targets.length}の設定済み部隊・基地・契約機関から巡回。${defenseBrowserRules[id].navigation}`]),
        ["調達ポータル","外部サイトへの案内リンク","このサイト自体の自動検索・スクレイピング・データ取り込みは準備中。官公需情報ポータルAPIとは別サービス。"],
      ]}/>
      <p>総合ページだけを読む方式ではありません。登録した機関の入口と既知の公告一覧を初期キューへ入れ、駐屯地・基地・会計隊のページ、入札公告・公示・公募・調達・見積依頼・オープンカウンター欄、個別のHTML・PDFへ進みます。URL・リンク文言・掲載表の構造から次の取得先を選び、機関ごとに順番を回します。</p>
      <p>陸自の富士学校は一時除外、幹部候補生学校・施設学校・衛生学校は対象外です。除外は巡回先と表示対象に適用し、過去の登録案件を削除する操作ではありません。</p>
      <details className="engineer-catalog"><summary>現在の設定対象 {gsdfProcurementCatalog.length+msdfProcurementCatalog.length+asdfProcurementCatalog.length}機関と入口URLを確認</summary>{[["陸上自衛隊",gsdfProcurementCatalog],["海上自衛隊",msdfProcurementCatalog],["航空自衛隊",asdfProcurementCatalog]].map(([name,entries])=><div key={String(name)}><h3>{String(name)}</h3><ul>{(entries as typeof gsdfProcurementCatalog).map(entry=><li key={entry.name}><strong>{entry.name}</strong><a href={entry.entryUrl} target="_blank" rel="noopener noreferrer">{entry.entryUrl}</a></li>)}</ul></div>)}</details>
      <Note title="設定数と取得成功数は別です"><p>現在のカタログは陸自16・海自33・空自28の77機関です。各機関の入口が登録されていることは、全リンク・全PDFの取得成功を意味しません。実行時の「取得状況」で未確認・失敗・上限到達を確認します。</p></Note>
    </Section>

    <Section id="collection" number="04" title="案件取得・解析・制限" files={["app/discovery-workspace.tsx","app/api/discovery/route.ts","lib/discovery-collector.ts","lib/discovery-fetch.ts","lib/defense-browser-engine.ts","lib/defense-browser-parser.ts","lib/defense-browser-client.ts","lib/defense-browser-types.ts"]}>
      <ol className="engineer-steps"><li><b>収集開始</b><p>「最新情報を取得」からPOST /api/discoveryにaction=startを送る。自衛隊選択時はその隊の巡回を優先する。共通キーワードと利用者が指定した語句を収集キューに追加する。</p></li><li><b>共有キューを少しずつ処理</b><p>画面から約6.5秒間隔でaction=stepを呼び、サーバーは最低5秒の処理間隔と90秒のリースで競合を抑える。他の利用者が処理中のstepは202の待機扱いにする。</p></li><li><b>通常HTTPで取得</b><p>robots.txtと許可URLを確認してHTMLを取得。文字コードを判別し、リンク・画像マップ・フレーム・公告表を解析する。移動先URLを検査してから辿る。人が画面をクリックし続ける操作をそのまま自動化したものではない。</p></li><li><b>必要時のみ画面描画</b><p>HTMLから得られる文字が少なくJavaScript描画が必要な場合、接続済みならCloudflare Browser Renderingの/contentを使う。拒否された403やCAPTCHAを描画経路で回避する用途ではない。</p></li><li><b>本文・PDFを解析して保存</b><p>件名、機関名、提出期限、資格記載、先行手続き、原文URLを抽出。公告と案内ページ、入札締切と開札日・納期を区別する。PDFは文字レイヤーをページ順に読み、根拠を残す。</p></li><li><b>取得状態を返す</b><p>候補と処理位置をD1へ保存し、検索結果を再読み込みする。ページを閉じると画面からのstep呼び出しは止まるが、保存済みデータと続きは残る。</p></li></ol>
      <SpecTable label="実装上の取得上限" headers={["項目","現行値・動作"]} rows={[
        ["官公需API","原則4語ずつ / 1回50件。応答4MiB超過時は10件・1件へ減らす。件数不足時は日付範囲を分割し、最大22段階・待機500条件。初回は日付を限定しない。"],
        ["自衛隊の巡回",`1ジョブ上限${browserLimits.pages}ページ、1機関${browserLimits.pagesPerTarget}ページ、深さ${browserLimits.depth}、待機キュー${browserLimits.queued}件。共有収集の保存候補数は画面の100件上限とは別扱い。`],
        ["HTML・描画結果","通常HTML 2MiB、Browser Rendering応答6MiB。通常HTTPは約25秒、描画REST呼び出しは約45秒のタイムアウト。"],
        ["PDF","旧40ページ制限は撤廃。1ファイル8MiB・抽出本文150万文字の制限は継続。ページ単位の途中再開保存は未実装。画像だけのPDFのOCRは未接続。"],
        ["候補本文","保存時にdescriptionTextを最大24,000文字へ制限する。原文全文を永久保存するアーカイブではなく、後半の条件が未取得になる場合がある。"],
        ["キャッシュ・再開","HTML・PDF抽出本文は6時間キャッシュ。robots.txtは24時間。キャッシュ保存は約1.5MB未満。新しい巡回は原則6時間空け、失敗API条件の再試行は原則5分空ける。"],
      ]}/>
    </Section>

    <Section id="search" number="05" title="検索・資格条件・要点カード" files={["lib/discovery-store.ts","lib/discovery-domain.ts","lib/procurement-workbench.ts","lib/procurement-classification.ts","lib/company-qualification.ts","lib/procurement-synonyms.ts","lib/procurement-brief.ts","app/opportunity-cards.tsx"]}>
      <p>「検索」はD1にある候補への検索です。毎回すべての外部ページへアクセスする動作とは分かれています。表示は1ページ{discoveryPageSize}件、保存時に正規化・資格判定した検索データをSQLで250件ずつ最大20,000件確認し、本文は表示対象の12件だけを読みます。検索結果は100件単位で追加表示でき、上限に達した場合は画面に表示します。</p>
      <SpecTable label="検索仕様" headers={["項目","動作"]} rows={[
        ["検索条件","画面の詳細条件は都道府県（複数選択・いずれかに一致）と提出期限（開始・終了）の2項目。件名と取得本文、OR、未来の締切、一致順を標準とする。旧保存条件の非表示項目は適用時に標準値へ戻す。取得先・契約区分・新着・キーワードは別欄で設定し、条件は利用者ごとに30件まで保存できる。"],
        ["言い換え検索","既定でオン。研修↔講習、Webサイト↔ホームページ等の登録済み辞書を使用。最長の該当表現を優先して置換し、未知の語はそのまま検索する。生成AI・ベクトル検索ではない。"],
        ["AND / OR","入力語ごとに言い換えグループを作り、グループ内はOR、入力語間は画面ではORとする（APIには従来のAND/OR指定も残る）。SQLの事前抽出と本文の照合を同じ条件にする。複数語は読点・カンマ・改行で区切り、空白だけでは分割しない。"],
        ["順位・一致理由","直接一致を言い換えのみの一致より優先し、件名・本文の一致数で加点。同順位は締切等で並べる。一致した元語・言い換え語・件名/本文を表示。発注機関名だけの混入は本文照合から除く。"],
        ["固定の資格等級","全省庁統一資格：物品の販売D / 役務の提供等D / 物品の買受けC。フリーモードを含む全4モードは共通の固定値を検索・照合に使う。フリーモードはキーワードのみ自由入力とし、参加資格経路・等級の除外条件は他のモードと同じ。旧保存値より固定値を優先し、資格プロフィールの変更APIは403で拒否する。有効期限は既存記録の参照のみで編集不可。A・B・C又はDのように登録等級が含まれる表記も対象。"],
        ["資格による表示制限","国の統一資格対象・オープンカウンターに加え、自治体案件を候補に表示。自治体は独自資格の要否にかかわらず初期状態を要確認とし、登録・所在地・法人実績・再委託・期限を原文で照合する。検索一致は技術的適合や参加資格の確定ではない。保存済み検索索引も新ルールで段階更新する。"],
        ["判定の限界","資格経路が不明なら非表示。統一資格経路が確認できても等級や複数区分の解釈が不明な場合は、断定せず原文確認を求める。営業品目・地域・実績等を含む最終参加可否は自動保証しない。"],
        ["期限と表示区分","既定ではJSTの本日より未来の締切を表示。当日の締切も通常一覧から外れる。締切不明、先行手続きの期限到来、再取得失敗、更新・中止等は要確認として扱う。"],
        ["要点カード","仕事内容・資格条件・入札/見積締切・先行手続き・提出方法・履行/納品場所の6項目。取得本文の短い記載を抜粋し、根拠と原文リンクを表示する。仕事内容の抜粋がなければ件名を表示。取得できない条件は未確認。"],
        ["表示上の配慮","カード / 一覧表を切り替え可能。オープンカウンターは金色で強調。詳細ボタンは各テーマの高コントラスト色。質問用メールを提出方法と誤認しないよう抽出箇所を制限し、禁止条件も残す。"],
      ]}/>
    </Section>

    <Section id="storage" number="06" title="保存データと共有範囲" files={["db/schema.ts","drizzle/","lib/discovery-store.ts","lib/guest-session.ts","app/api/procurement-workbench/route.ts"]}>
      <SpecTable label="D1の主要テーブル" headers={["テーブル","役割・主なデータ","共有範囲"]} rows={[
        ["discovery_candidates","件名・機関・本文・期限・分類・根拠・原文URL・取得元URL・初回/最終取得・変更時刻・fingerprint","全利用者・4モード共通"],
        ["discovery_runtime","収集キュー、状態、待機先、リース、処理数、scheduler-heartbeat","共有の収集状態"],
        ["discovery_cache","URL別の取得本文と取得時刻","共有キャッシュ"],
        ["discovery_reviews","確認済み / 対象外、理由、確認した版","利用者ID × タブ × 案件"],
        ["discovery_revisions","前回の件名・期限・本文等の変更スナップショット","案件単位の履歴"],
        ["procurement_preferences / saved_procurement_searches","旧資格プロフィール・有効期限の参照、保存した検索条件（等級は固定値で上書き解釈）","利用者IDごと"],
        ["lark_bid_registrations","重複キー、client_token、登録先区分、record_id、状態、警告、リース","会員・Base・テーブル構成別に分離"],
        ["bids / bid_members","ポータル内の手入力案件・作業・結果、メンバー/権限情報","共有管理用。Larkレコードそのものではない"],
        ["defense_browser_jobs / bid_research_jobs","個別ブラウザー取得経路・旧来の調査ジョブ用スキーマ","互換性のため残る経路を含む"],
      ]}/>
      <p>候補の同一性は「正規化した原文URL＋正規化した件名」のSHA-256で判定します。本文・期限・分類等のfingerprintが変わると前の内容を履歴へ残し、確認後の変更を再表示します。異なるURLの類似案件をAIで自動統合する処理はありません。</p>
      <p>再取得に失敗した際は、前回成功した本文・締切・最終成功時刻を残して失敗情報を追加します。取り直せなかったことを新しい公告内容として上書きしません。会員の確認履歴・保存条件は会員IDに紐付き、同じIDでログインすれば端末をまたいで参照できます。会員セッションは7日有効で、利用停止・パスワード再設定・ログアウト時には無効化します。</p>
    </Section>

    <Section id="lark" number="07" title="Lark Base登録の仕様" files={["app/lark-registration.tsx","app/api/lark/registrations/route.ts","lib/lark-registration.ts","lib/lark-client.ts","lib/lark-store.ts"]}>
      <p>ここでの連携先はLark Baseです。Base全体をダウンロードして複製する方式ではなく、選択した案件をLark Open APIで既存テーブルへ1件ずつ作成します。Lark SDKは使わず、サーバーのfetchでJSONを送受信しています。</p>
      <SpecTable label="Larkの登録先" headers={["画面の区分","固定の登録先テーブル"]} rows={[["SFL専用","SFL専用【案件管理】"],["エンジニア専用","エンジニア専用【案件管理】"],["Academy専用","一般用【Academy専用】"]]}/>
      <ol className="engineer-steps"><li><b>入力検証・登録ロック</b><p>選択した区分、件名、機関名、公告URL、締切を受信。入力形式と未来の締切をサーバーで検証し、対象別の重複キーと90秒リースを取得する。</p></li><li><b>Larkアプリ認証</b><p>LARK_APP_ID / LARK_APP_SECRETからtenant_access_tokenを取得し、失効の60秒前までサーバー内でキャッシュする。利用者のChatGPT認証情報はLarkへ送らない。</p></li><li><b>登録先と項目を確認</b><p>LARK_BASE_APP_TOKENを使用するか、固定Wikiノードからobj_type=bitableのBaseトークンを解決する。登録先テーブルはサーバー側で固定し、5項目の型を確認する。</p></li><li><b>重複を確認して新規作成</b><p>案件先機関名・案件先URLだけを最大5,000件まで読み、URL＋機関名＋リンク表示名の件名を照合する。一致がなければ保存済みUUIDをclient_tokenとしてレコード作成APIを呼ぶ。</p></li><li><b>結果を保存</b><p>成功したrecord_idをD1に保存し、利用者へLarkのレコードリンクを返す。応答不明ならuncertainで止め、次回は登録状況を照会して二重送信を防ぐ。</p></li></ol>
      <SpecTable label="Larkへの項目対応" headers={["既存フィールド","型","送る値・扱い"]} rows={[
        ["案件先機関名","テキスト（1）","抽出した発注機関名"],
        ["案件先URL","ハイパーリンク（15）","text＝案件名、link＝公告原文URL。独立した案件名フィールドを新設する処理ではない。"],
        ["提出期限","日付（5）","確認済み日付のJST 00:00をepochミリ秒へ変換。入札の実際の締切時刻を送る仕様ではない。"],
        ["都道府県","単一選択（3）","取得した県名が既存の選択肢に一致した場合だけ送る。不明/不一致なら空欄と警告。"],
        ["種別管理","単一選択（3）","全省庁統一資格必須を優先し、なければオープンカウンター。既存選択肢に一致する場合だけ送る。"],
      ]}/>
      <Note title="連携範囲"><p>担当者・金額・チェック欄・関連レコード・項目定義の変更は行いません。Lark側で編集した情報をポータルの候補へ戻す双方向同期もありません。画面上の資格・要確認制御と、登録APIの入力/期限検証は別処理です。資格の最終確認は原文で行います。</p></Note>
    </Section>

    <Section id="notifications" number="08" title="案件通知・週次通知・定期収集" files={["docs/discovery-operations.md","lib/discovery-digest.ts","app/api/notifications/daily-digest/route.ts","worker/index.ts","lib/discovery-collector.ts"]}>
      <SpecTable label="自動化の違い" headers={["処理","担当する場所","状態・確認点"]} rows={[
        ["Baseへ案件が追加された通知","Lark Base側の自動化 → 【SFL/LUCIA】入札案件管理グループ","通知のトリガー・本文・送信先はLark側の設定。ポータルのLarkクライアントが直接チャットへ送る実装ではない。現行の自動化定義は面談時にLarkで確認する。"],
        ["毎週月曜日10:00の通知（JST）","Lark側の定時自動化 → ポータルの集計API → グループ送信","運用記録では2026/9/16に設定・有効化済み、同日12:34 JSTの取得/送信成功を記録。初回定時予定は9/21。今回の仕様書作成でLarkの現設定・到着ログを再取得したものではない。"],
        ["新しい公告の無人収集","Workerのscheduledハンドラー","コードは実装済みだが、Sitesへの通常公開だけではCronは登録されない。現行の運用記録は定期収集未接続。週次通知が届くことは、無人収集が動く証拠にはならない。"],
      ]}/>
      <h3>週次集計APIの内容</h3><p><code>POST /api/notifications/daily-digest</code> を専用Bearerキーで呼び、<code>{'{date, message}'}</code>を返します。互換性のためURL名はdaily-digestですが、集計期間は過去7日間です。本文には新規保存・更新・保存総数、今日から7日後までの期限候補最大5件、ポータル内の提出前案件最大5件、取得状況を含めます。</p>
      <p>総数には資格で非表示・締切済みの候補も含みます。期限候補には統一資格/オープンカウンターの参加経路フィルターを適用しますが、固定のD/D/C等級までは照合しません。Lark Base側だけで管理している案件の集計や、公告の新規取得・登録をこのAPIで行うことはありません。</p>
    </Section>

    <Section id="api" number="09" title="API・認証・環境変数" files={["app/api/","lib/server-store.ts","lib/guest-session.ts","lib/lark-client.ts","lib/defense-browser-client.ts","lib/discovery-digest.ts"]}>
      <SpecTable label="主なポータルAPI" headers={["経路・メソッド","用途","認証・入力"]} rows={[
        ["GET /api/discovery","保存候補検索、件数、取得進捗","会員または管理者のみ。キーワード・取得先・表示区分・資格関連の条件を受ける。"],
        ["GET /api/open-counter","ホームのオープンカウンター特集","会員または管理者のみ。全分野の保存案件からOC分類を固定抽出。今日以前の締切・資格不一致を除外。7日以内・新着/更新・要確認、発注機関、並び順、12件ページ送り。外部取得・Lark書き込みは行わない。"],
        ["POST /api/discovery","start / step / pause / review / confirm-deadline","会員または管理者のみ。同一サイトOriginとJSON形式を検証。"],
        ["GET / POST /api/procurement-workbench","固定資格の参照・保存検索・変更履歴","会員または管理者のみ。保存検索は利用者単位で30件。profile変更は403（qualification_locked）。history指定は共有候補の履歴参照。"],
        ["POST /api/lark/registrations","選択案件の登録","会員または管理者のみ。登録先はログイン会員の保存済み接続で決定。Zod入力検証、期限、重複確認。"],
        ["POST /api/lark/registrations/status","D1の登録状態を取得","会員または管理者のみ。区分と候補の識別情報を指定。"],
        ["POST /api/member-access","会員ログイン・ログアウト","同一OriginのJSONのみ。Cookieは7日有効。"],
        ["GET / POST / PATCH /api/member-accounts","会員の発行・停止・パスワード再設定","所有者のみ。パスワード・セッション秘密値は応答に含めない。"],
        ["GET /api/lark/connection","3登録先の接続・項目構成確認","所有者のみ。レコードを作成しない。作成権限の実証とは別。"],
        ["POST /api/notifications/daily-digest","週次通知用の読み取り専用集計","LARK_DIGEST_TOKENでBearer認証。未設定503、不一致401。"],
        ["/api/bids /api/dashboard /api/members","共有の手入力案件・集計・担当者管理","案件・集計は会員のみ。担当者管理はownerを確認。左メニューを非表示にした案件管理・分析の実装は内部に残る。"],
      ]}/>
      <h3>会員ログインと管理者</h3><p>公開ガイドは匿名閲覧できます。案件系APIは会員セッションまたは所有者認証が必須です。会員パスワードはsalt付きscrypt（N=16384 / r=8 / p=5）でハッシュ化し、セッションのランダム値はハッシュだけをD1へ保存します。会員Cookieは<code>__Host-bid-member</code>（Secure / HttpOnly / SameSite=Lax）です。ID・接続元・全体のログイン回数を制限します。Sitesの認証済みヘッダーとBID_OWNER_EMAILで所有者を照合し、会員管理APIは所有者のみが操作できます。一般のChatGPTログインだけでは案件を閲覧できません。サイトとAPIの個人別応答はno-storeとし、Cookie等でVaryを分けます。noindexは検索エンジン向けの指定であり、アクセス認証ではありません。</p>
      <SpecTable label="環境変数の用途" headers={["名前","用途"]} rows={[
        ["DB","Sitesが接続するD1バインディング"],["BID_OWNER_EMAIL","所有者の識別"],
        ["LARK_APP_ID / LARK_APP_SECRET","Larkカスタムアプリのtenant認証"],["LARK_BASE_APP_TOKEN","任意のBase接続トークン。省略時は固定Wikiノードを解決"],
        ["CLOUDFLARE_BROWSER_ACCOUNT_ID / CLOUDFLARE_BROWSER_API_TOKEN","JavaScript描画が必要なページのBrowser Rendering接続"],["LARK_DIGEST_TOKEN","週次集計だけを参照する機械間認証キー"],
      ]}/><p>環境変数の値は公開ページやブラウザへ渡しません。接続先BaseやAPI URLをブラウザから自由指定できる形にはしていません。移管時はSitesの公開権限、環境変数、LarkアプリとBaseの権限を個別に確認します。</p>
    </Section>

    <Section id="operations" number="10" title="障害対応・監視・保守" files={["lib/defense-fetch-error.ts","lib/discovery-fetch.ts","lib/discovery-collector.ts","lib/lark-store.ts","app/discovery-coverage.tsx","docs/discovery-operations.md"]}>
      <SpecTable label="エラーの切り分け" headers={["症状","現在の扱い・確認すること"]} rows={[
        ["公式ページ403 / CAPTCHA","自動取得拒否として対象URLに記録。別経路で制限を回避しない。他の確認先は継続可能。公式原文を人が確認する。"],
        ["公式ページ404","公告URLと掲載元URLを記録。現行の一覧に実際に掲載された移動先だけを確認し、カタログ・解析ルールを更新する。"],
        ["429 / タイムアウト / 上限","待機・停止・未確認として保存。接続先の利用上限、応答量、処理時間を確認。未取得を0件成功と扱わない。"],
        ["Browser Rendering認証エラー","Cloudflare接続の認証・権限を確認。通常の公式サイト403と区別する。"],
        ["収集stepの競合","共有ロックを尊重し、202で待機。別利用者の収集状態を壊さず再取得する。"],
        ["再取得失敗","前回成功データを表示し、取得失敗と最終成功時刻を明示。原文が最新か確認する。"],
        ["Larkの項目型変更","想定外の項目構成なら登録を止める。フィールドや選択肢をコードから勝手に追加・変更しない。"],
        ["Lark登録結果が不明","uncertainを保持し、Larkの既存レコードを再照合。自動再送で重複を増やさない。担当者がLark側を確認してから復旧する。"],
      ]}/>
      <h3>確認する指標</h3><p>取得先ごとの最終試行/成功時刻、未取得URL、上限到達、待機キュー、保存数、APIエラー、Lark登録の未確定状態を確認します。現行画面・ログは取得の観測点であり、全機関の網羅率・新着検知時間・SLAを保証する監視システムではありません。</p>
      <h3>費用の整理</h3><p>現行処理にOpenAI APIのトークン従量課金は組み込まれていません。確認対象はSitesの契約・公開枠、Cloudflareの実行/保存とBrowser Renderingの利用枠、Larkの契約・Base自動化/API利用枠です。Sites管理リソースと任意設定のBrowser Renderingアカウントは分けて確認します。契約金額・請求先・実測利用量をこの資料で集計していないため、月額費用は未確定です。</p>
    </Section>

    <Section id="handover" number="11" title="開発・公開・検証手順" files={["package.json","package-lock.json","vite.config.ts","worker/index.ts",".openai/hosting.json","drizzle/","tests/discovery.test.mjs","tests/discovery-search-ui.test.mjs","tests/lark-registration.test.mjs"]}>
      <SpecTable label="コードの入口" headers={["ファイル/領域","変更するときの入口"]} rows={[
        ["app/bid-app.tsx","左メニュー、ハッシュによる画面切り替え、各ワークスペース"],["app/discovery-workspace.tsx","検索条件、収集開始/続行、結果、カード/一覧表、Lark操作"],
        ["lib/*-procurement-catalog.ts","各自衛隊の機関・既知の公告欄URL"],["lib/defense-browser-parser.ts / lib/defense-browser-engine.ts","リンク選別、公告の構造解析、巡回順、機関別進捗"],
        ["lib/procurement-classification.ts / company-qualification.ts","資格経路、オープンカウンター、営業区分と等級"],["lib/procurement-synonyms.ts / procurement-brief.ts","言い換え辞書と根拠付きの要点抽出"],
        ["lib/lark-client.ts / lark-store.ts","外部API契約、項目対応、重複防止、登録状態の復旧"],
      ]}/>
      <ol className="engineer-steps"><li><b>受け取り・環境確認</b><p>既存Sitesプロジェクトのソースリポジトリを利用し、.openai/hosting.jsonのサイト識別を引き継ぐ。Node.jsは22.13.0以上、依存はロックファイルを使う。新しいサイトを作り直す前に移管方法を確認する。</p></li><li><b>開発・検証</b><p>package.jsonのinstall:ci / dev / buildを利用。主要テストはnode --testによる実SQL・固定フィクスチャ・模擬外部APIの検証。スキーマ変更時はDrizzleマイグレーションを生成・レビューする。</p></li><li><b>公開</b><p>ソースをコミットしてリポジトリへ送信し、同じソースから作ったWorkerと静的アセットをSitesの保存版として公開する。保存版と公開成功を確認し、現行の公開範囲を維持する。環境変数・D1はSitesの管理経路で接続する。</p></li><li><b>外部サービスを含む受入確認</b><p>ポータルで3自衛隊を検索し、原文の件名・期限・資格と突き合わせる。合意した案件をLarkへ1回登録し、レコードと通知の到着を確認する。無人収集は別途実行ログとheartbeatで確認する。</p></li></ol>
      <Note title="直近の検証記録"><p>公開版114では検索の34,560通りの組み合わせ、言い換えのオン/オフ・AND/OR・資格条件、要点抽出、3自衛隊選択時の画面操作を自動テストで確認しています。ビルド・公開成功も確認済みです。これらは全基地の現在の外部通信成功や、Lark自動化の最新の実行結果を保証するものではありません。</p></Note>
    </Section>

    <Section id="next" number="12" title="面談で決めること・未実装項目" files={["docs/discovery-operations.md","lib/discovery-digest.ts","lib/procurement-brief.ts","lib/discovery-store.ts","lib/lark-store.ts"]}>
      <SpecTable label="引き継ぎ時の検討事項" headers={["優先","論点","現状と次に決めること"]} rows={[
        ["1","運用所有者・アクセス権","Sites / ソース / D1 / Larkアプリ / Browser Renderingの管理者と請求先を整理。公開・ロールバック・障害対応の担当を決める。"],
        ["1","定期収集の実行基盤","scheduled処理の接続先・頻度・機械間認証・停止方法・費用枠を決める。週次集計通知とは別に受入試験する。"],
        ["1","公開利用と登録権限","現状はゲストが検索・収集開始・Lark登録を利用可能。一般公開の範囲、操作量制限、登録承認、登録API側での保存候補・資格条件再照合を検討する。"],
        ["1","取得の正確性・鮮度","代表基地の原文を正解データにして、取りこぼし・誤抽出・最終取得時刻を測定。77機関の設定数を網羅率と混同しない。"],
        ["2","PDF・本文の充実","画像PDFのOCR、24,000文字を超える本文の扱い、長いPDFの途中再開、必要資料の保存/保持期間を設計する。"],
        ["2","検索の規模拡大","現状はSQL LIKEとルール照合。全文索引、表記辞書の保守、検索時間、20,000件の走査制限、結果評価の方法を検討。ベクトル検索は未実装。"],
        ["2","Lark運用・同期","実際の自動化設定、通知項目・送信先・失敗時の再送、5,000件を超える重複確認を確認。Larkからの更新取り込み・双方向同期は未実装。"],
        ["2","データ保全・監視","バックアップ/復元、ログ保持、異常通知、利用量の可視化、秘密情報の更新手順を運用として定義する。"],
        ["3","取得先の追加","調達ポータル自体の自動取得は未接続。利用可能な公式API・許諾・取得方式を確認したうえで追加する。"],
      ]}/>
      <p>このページは面談用の実装スナップショットです。仕様を変更した際は、対象コードと一緒に本書の日付・制限値・運用状況を更新してください。</p>
    </Section>
    <footer className="engineer-document-footer"><p>合同会社SFL / LUCIA · 入札リンクポータル 技術仕様書 · 2026年9月16日</p><button type="button" className="text-button engineer-toolbar" onClick={()=>jump("engineer-document-top")}><ArrowUp size={17}/>仕様書の先頭へ</button></footer>
  </article>;
}
