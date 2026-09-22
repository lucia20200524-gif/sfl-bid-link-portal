import { LogIn, ShieldCheck } from "lucide-react";

export default function MemberAccess({
  signOutUrl, status = "signin", message = "",
}: {
  signInUrl: string;
  signOutUrl: string;
  status?: "signin" | "membership" | "loading" | "error";
  message?: string;
}) {
  const heading = status === "membership" ? "アカウント情報の確認が必要です"
    : status === "loading" ? "ログイン状況を確認しています"
    : status === "error" ? "利用状況を確認できませんでした"
    : "ポータルを開き直してください";
  return <main className="member-access-screen">
    <section className="access-card member-access-card" aria-labelledby="member-access-heading" aria-busy={status === "loading"}>
      <div className="member-access-brand"><img src="/sfl-logo.jpeg" alt="SFL"/><img src="/lucia-logo.jpeg" alt="LUCIA"/></div>
      <div className="access-icon"><ShieldCheck size={30} aria-hidden="true"/></div>
      <p className="eyebrow">SFL 入札リンクポータル</p>
      <h1 id="member-access-heading">{heading}</h1>
      {status === "signin" && <p>下のボタンから、もう一度お試しください。案件検索には会員ログインが必要です。</p>}
      {status === "membership" && <p role="alert">アカウント情報を確認できませんでした。<br/>管理者の小寺 健太さんにお問い合わせください。</p>}
      {status === "error" && <p role="alert">{message || "時間をおいて、もう一度お試しください。"}</p>}
      {status === "loading" && <p role="status">確認が終わるまで、そのままお待ちください。</p>}
      <div className="actions">
        {status === "signin" && <a className="button challenge-button" href="/" target="_top"><LogIn size={18} aria-hidden="true"/>ポータルを開く</a>}
        {status === "membership" && <a className="button challenge-button" href={signOutUrl} target="_top">公開ページに戻る</a>}
        {status === "error" && <a className="button challenge-button" href="/" target="_top">再読み込み</a>}
      </div>
    </section>
    <p className="member-access-footer">LUCIA × 合同会社SFL</p>
  </main>;
}
