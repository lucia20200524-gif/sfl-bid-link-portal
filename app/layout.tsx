import type { Metadata } from "next";
import "./globals.css";
import "./navigator-themes.css";
import "./portal-useful-info.css";
import "./portal-bid-flow.css";
import "./procurement-workbench.css";
import "./engineer-spec.css";
import "./open-counter-feature.css";
import "./portal-typography.css";
import "./portal-colors.css";
import "./candidate-detail.css";
import "./portal-navigation.css";
import "./portal-mobile.css";
import "./portal-membership.css";
import "./member-lark-settings.css";
import "./bid-practice-tools.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "SFL 入札リンクポータル｜得意な仕事を、次の挑戦に。",
  description: "官公庁の仕事を探す、公告を確かめる、Larkへ登録する。SFL・エンジニア・Academyそれぞれの案件探しから提出管理までをつなぐ入札ポータル。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
