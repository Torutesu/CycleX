import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/layout/header";
import { TabBar } from "@/components/layout/tab-bar";
import { getCurrentUser } from "@/lib/session";
import { getUnreadCount } from "@/features/message/queries";
import "./globals.css";

export const metadata: Metadata = {
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
    <html lang="ja">
      <body className="min-h-dvh antialiased">
        <Header user={user} unreadCount={unreadCount} />
        {/* スマホは下部タブバーの高さぶん余白を確保する */}
        <main className="pb-20 md:pb-0">{children}</main>
        <TabBar unreadCount={unreadCount} />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
