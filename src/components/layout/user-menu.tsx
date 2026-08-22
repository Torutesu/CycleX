"use client";

import Link from "next/link";
import { LogOut, Settings, User as UserIcon, Package, ShoppingBag, Shield } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/features/auth/actions";
import { avatarImageUrl } from "@/lib/images";
import type { SessionUser } from "@/lib/session";

/** ヘッダー右端のアカウントメニュー。未ログイン時はログイン導線を出す。 */
export function UserMenu({ user }: { user: SessionUser | null }) {
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">ログイン</Link>
        </Button>
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link href="/signup">会員登録</Link>
        </Button>
      </div>
    );
  }

  const avatarSrc = avatarImageUrl(user.avatarUrl);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label="アカウントメニュー">
          <Avatar className="size-8">
            {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
            <AvatarFallback>{user.displayName.slice(0, 1) || "U"}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{user.displayName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/mypage">
            <UserIcon className="size-4" aria-hidden />
            マイページ
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/mypage/listings">
            <Package className="size-4" aria-hidden />
            出品した商品
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/mypage/purchases">
            <ShoppingBag className="size-4" aria-hidden />
            購入した取引
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/mypage/settings">
            <Settings className="size-4" aria-hidden />
            設定
          </Link>
        </DropdownMenuItem>
        {user.role === "admin" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <Shield className="size-4" aria-hidden />
                管理画面
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={logout} className="w-full">
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="size-4" aria-hidden />
              ログアウト
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
