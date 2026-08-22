import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Heart, Package, Settings, ShoppingBag, UserPen, ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireUser } from "@/lib/session";
import { avatarImageUrl } from "@/lib/images";
import { labelOf, PREFECTURES } from "@/lib/constants";

export const metadata: Metadata = { title: "マイページ" };

const MENU = [
  { href: "/mypage/listings", label: "出品した商品", icon: Package },
  { href: "/mypage/purchases", label: "購入した取引", icon: ShoppingBag },
  { href: "/mypage/favorites", label: "お気に入り", icon: Heart },
  { href: "/mypage/profile", label: "プロフィール編集", icon: UserPen },
  { href: "/mypage/settings", label: "設定", icon: Settings },
] as const;

export default async function MyPage() {
  const user = await requireUser("/mypage");
  const avatarSrc = avatarImageUrl(user.avatarUrl, 128);
  const prefecture = labelOf(PREFECTURES, user.prefecture);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="sr-only">マイページ</h1>

      {!user.emailVerified && (
        <Alert className="mb-5">
          <AlertDescription>
            メールアドレスの確認が完了していません。出品・購入・メッセージのご利用には確認が必要です。
            <Link
              href={`/verify-email?email=${encodeURIComponent(user.email)}`}
              className="ml-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              確認メールを再送する
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <section className="flex items-center gap-4 rounded-xl border bg-card p-4">
        {avatarSrc ? (
          <Image
            src={avatarSrc}
            alt=""
            width={64}
            height={64}
            className="size-16 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <Avatar className="size-16">
            <AvatarFallback className="text-lg">{user.displayName.slice(0, 1) || "U"}</AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{user.displayName}</p>
          <p className="text-sm text-muted-foreground">{prefecture ?? "所在地未設定"}</p>
        </div>
        <Link
          href={`/users/${user.id}`}
          className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          公開ページ
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </section>

      <nav className="mt-6">
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {MENU.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <Icon className="size-5 text-muted-foreground" aria-hidden />
                  <span className="flex-1 text-sm font-medium">{item.label}</span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
