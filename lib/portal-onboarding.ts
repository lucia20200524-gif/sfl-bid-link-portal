export const onboardingStorageKey = "sfl.portal.onboarding.v1";
export const onboardingSteps = [
  { title: "自分に合う対象を選ぶ", view: "collected", selector: '[data-tour="audience"]', action: "4つのタブから、自分に合う対象を押してください。", detail: "SFLはAI・DXや研修、エンジニアはWeb・システム開発、Academyは物品・印刷・清掃など。フリーモードは自由なキーワードで探せます。参加資格・等級の固定条件は全モード共通です。", check: "探す仕事の分野" },
  { title: "キーワードを用意する", view: "collected", selector: '[data-tour="keywords"]', action: "「キーワードを自動生成」を押すか、探したい仕事を入力しましょう。", detail: "例：研修、Webサイト、印刷。自動生成された語句も編集できます。フリーモードではキーワードの入力が必要です。それ以外は空欄なら、そのタブのおすすめ分野から探せます。", check: "自分が対応できる仕事内容" },
  { title: "検索先を確認する", view: "collected", selector: '[data-tour="sources"]', action: "初めは「取得済み案件｜全検索先」を選ぶと確認しやすくなります。", detail: "官公需APIや各公式ページから取得した保存結果が対象です。調達ポータルの自動検索は準備中で、公式サイトから確認します。", check: "自動検索できる媒体か" },
  { title: "保存済みの案件を探す", view: "collected", selector: '[data-tour="saved-search"]', action: "「検索」を押して、キーワードに合う候補を見ましょう。", detail: "新たに取得せず、保存されている候補から探すこともできます。表示が少ない場合は語句を短くするか、別の呼び方でも試してください。", check: "キーワードに合う候補" },
  { title: "新しい公告を取得する", view: "collected", selector: '[data-tour="collect"]', action: "検索先を選んだら、その下の「最新情報を取得」を押します。", detail: "新しい公告を順に取得して保存します。取得には時間がかかります。ここでは場所を確認するだけでも次へ進めます。", check: "収集中・未確認の取得先" },
  { title: "結果と要確認の候補を見る", view: "collected", selector: '[data-tour="result-views"]', fallback: '[data-tour="results-heading"]', action: "「おすすめ・新着」だけでなく、「関連候補」「要確認」も押してみましょう。", detail: "締切不明や条件の再確認が必要な候補は「要確認」に入ります。0件でも、取得が途中・失敗している場合があります。「設定・仕様」の「公告の取得状況」も確認してください。", check: "提出期限・先行手続き・取得状況" },
  { title: "公式公告を開く", view: "collected", selector: '[data-tour="candidate-details"], [data-tour="official-link"]', fallback: '[data-tour="results-heading"]', action: "気になる案件の「詳細」を押し、詳細画面の「公式公告を開く」から原文を確認します。", detail: "仕事内容・参加資格・締切・提出方法を原文で確認してから、このポータルに戻ってください。", unavailable: "今は案件の「詳細」ボタンが表示されていません。キーワードや結果のタブを変えるか、公告を取得すると確認できます。場所の説明を読んで次へ進んでも大丈夫です。", check: "原文の仕事内容・資格・締切・提出方法" },
  { title: "必要な案件をLarkへ登録する", view: "collected", selector: '[data-tour="lark-action"]', fallback: '[data-tour="results-heading"]', action: "案件の「詳細」を開いて原文で条件を確認し、進めたい案件だけ「Larkへ登録」を押します。", detail: "対象タブに対応するLarkのテーブルへ登録されます。フリーモードは詳細画面で保存先を選べます。ボタンが無効なときは、締切・要確認の条件・Lark接続を確認してください。練習のための登録は不要です。", unavailable: "登録ボタンは案件の「詳細」内にあります。候補が見つかり、原文の条件を確認できてから登録しましょう。", check: "登録先の対象タブ・期限・Lark接続" },
  { title: "ポータル内の案件を管理する", view: "bids", selector: '[data-tour="bid-management"]', action: "「案件・提出管理」では、ポータルに保存した案件を絞り込めます。", detail: "案件名から詳細・進捗・担当者を更新します。Larkへの登録とポータルの手入力管理は別の機能です。Larkに登録した案件はLark側で確認してください。", check: "担当者・進捗・提出期限" },
] as const;
export function readOnboardingProgress(raw: string | null) {
  try { const value=JSON.parse(raw??"null");return { seen:value?.seen===true, completed:value?.completed===true, step:Number.isInteger(value?.step)&&value.step>=0&&value.step<onboardingSteps.length?value.step:0 }; }
  catch { return {seen:false,completed:false,step:0}; }
}
