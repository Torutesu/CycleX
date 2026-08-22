"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, PlusCircle, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";

type TabBarProps = {
  /** 未読メッセージ合計。0 のときはバッジを出さない */
  unreadCount?: number;
};

const TABS = [
  { href: "/", label: "ホーム", icon: Home, match: (p: string) => p === "/" },
  { href: "/search", label: "さがす", icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/sell", label: "出品", icon: PlusCircle, match: (p: string) => p.startsWith("/sell") },
  {
    href: "/messages",
    label: "メッセージ",
    icon: MessageCircle,
    match: (p: string) => p.startsWith("/messages"),
  },
  { href: "/mypage", label: "マイページ", icon: User, match: (p: string) => p.startsWith("/mypage") },
] as const;

/**
 * スマホ用の下部固定タブバー(FR-14)。
 * md 以上ではヘッダーナビゲーションに切り替わるため非表示にする。
 */
export function TabBar({ unreadCount = 0 }: TabBarProps) {
  const pathname = usePathname();

  // 管理画面では一般向けタブを出さない
  if (pathname.startsWith("/admin")) return null;

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
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
