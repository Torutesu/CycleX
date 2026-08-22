import Link from "next/link";
import { Heart, MessageCircle, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/layout/search-bar";
import { UserMenu } from "@/components/layout/user-menu";
import type { SessionUser } from "@/lib/session";

type HeaderProps = {
  user: SessionUser | null;
  unreadCount: number;
};

/**
 * 共通ヘッダー(FR-14)。
 * スマホではロゴ+検索のみ、md 以上でナビゲーションを展開する。
 */
export function Header({ user, unreadCount }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:h-16 md:gap-6">
        <Link
          href="/"
          className="shrink-0 text-lg font-bold tracking-tight text-primary md:text-xl"
        >
          CycleX
        </Link>

        <div className="hidden flex-1 md:block">
          <SearchBar className="max-w-xl" />
        </div>

        <nav className="ml-auto flex items-center gap-1 md:gap-2">
          <Button asChild size="sm" className="hidden md:inline-flex">
            <Link href="/sell">
              <PlusCircle className="size-4" aria-hidden />
              出品する
            </Link>
          </Button>

          {user && (
            <>
              <Button asChild variant="ghost" size="icon" className="hidden md:inline-flex">
                <Link href="/mypage/favorites" aria-label="お気に入り">
                  <Heart className="size-5" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="icon" className="relative hidden md:inline-flex">
                <Link href="/messages" aria-label={`メッセージ${unreadCount > 0 ? `(未読${unreadCount}件)` : ""}`}>
                  <MessageCircle className="size-5" aria-hidden />
                  {unreadCount > 0 && (
                    <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Link>
              </Button>
            </>
          )}

          <UserMenu user={user} />
        </nav>
      </div>

      {/* スマホは検索バーを2段目に置き、親指の届く位置を確保する */}
      <div className="border-t px-4 py-2 md:hidden">
        <SearchBar />
      </div>
    </header>
  );
}
