"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, PlusCircle, MessageCircle, User, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

type TabBarProps = {
  /** ログイン済みかどうか。未ログインには会員専用のタブを出さない */
  signedIn?: boolean;
  /** 未読メッセージ合計。0 のときはバッジを出さない */
  unreadCount?: number;
};

type Tab = {
  href: string;
  label: string;
  icon: typeof Home;
  match: (pathname: string) => boolean;
};

// 誰でも使えるタブ。出品はログインへ誘導する主導線なので未ログインでも出す
// (ヘッダーの「出品する」ボタンと同じ扱い)
const PUBLIC_TABS: Tab[] = [
  { href: "/", label: "ホーム", icon: Home, match: (p) => p === "/" },
  { href: "/search", label: "さがす", icon: Search, match: (p) => p.startsWith("/search") },
  { href: "/sell", label: "出品", icon: PlusCircle, match: (p) => p.startsWith("/sell") },
];

// ログイン済みのみ。未ログインで押しても /login に弾かれるだけなので出さない
const MEMBER_TABS: Tab[] = [
  {
    href: "/messages",
    label: "メッセージ",
    icon: MessageCircle,
    match: (p) => p.startsWith("/messages"),
  },
  { href: "/mypage", label: "マイページ", icon: User, match: (p) => p.startsWith("/mypage") },
];

// 未ログインの 4 つ目。ヘッダー右端の「ログイン」に対応する
const GUEST_TABS: Tab[] = [
  {
    href: "/login",
    label: "ログイン",
    icon: LogIn,
    match: (p) => p.startsWith("/login") || p.startsWith("/signup"),
  },
];

/**
 * スマホ用の下部固定タブバー(FR-14)。
 * md 以上ではヘッダーナビゲーションに切り替わるため非表示にする。
 */
export function TabBar({ signedIn = false, unreadCount = 0 }: TabBarProps) {
  const pathname = usePathname();

  // 管理画面では一般向けタブを出さない
  if (pathname.startsWith("/admin")) return null;

  const tabs = [...PUBLIC_TABS, ...(signedIn ? MEMBER_TABS : GUEST_TABS)];

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className={cn("grid", tabs.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" aria-hidden />
                  {tab.href === "/messages" && unreadCount > 0 && (
                    <span className="absolute -right-2 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
