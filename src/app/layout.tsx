import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/layout/header";
import { TabBar } from "@/components/layout/tab-bar";
import { MainArea, SiteChrome } from "@/components/layout/site-chrome";
import { getCurrentUser } from "@/lib/session";
import { getUnreadCount } from "@/features/message/queries";
import { appBaseUrl } from "@/lib/utils";
import "./globals.css";

// 日本語 UI のため、環境に依存しないゴシック体を明示的に読み込む
const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  // OGP 画像や canonical の相対 URL を解決するための基準
  metadataBase: new URL(appBaseUrl()),
  title: {
    default: "CycleX | 自転車・パーツの個人間売買",
    template: "%s | CycleX",
  },
  description:
    "ロードバイクからパーツまで、自転車に特化したC2Cマーケットプレイス。フレームサイズやコンポーネントで探せます。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0E7C6B",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  const unreadCount = user ? await getUnreadCount(user.id) : 0;

  return (
    <html lang="ja" className={notoSansJp.variable}>
      <body className="min-h-dvh antialiased">
        <SiteChrome>
          <Header user={user} unreadCount={unreadCount} />
        </SiteChrome>
        {/* スマホは下部タブバーの高さぶん余白を確保する */}
        <MainArea>{children}</MainArea>
        <TabBar signedIn={Boolean(user)} unreadCount={unreadCount} />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
