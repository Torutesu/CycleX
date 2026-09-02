import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ChevronRight,
  Heart,
  Package,
  Settings,
  ShoppingBag,
  UserPen,
  ExternalLink,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireUser } from "@/lib/session";
import { avatarImageUrl } from "@/lib/images";
import { labelOf, PREFECTURES } from "@/lib/constants";
import { getMyPageSummary, type MyPageSummary } from "@/features/profile/summary";

export const metadata: Metadata = { title: "マイページ" };

type MenuItem = {
  href: string;
  label: string;
  icon: typeof Package;
  /** 件数などの補足。一覧を開かなくても状況が分かるようにする */
  note?: string;
  /** いま自分が動く番であることの注意書き */
  action?: string;
};

function buildMenu(summary: MyPageSummary): MenuItem[] {
  const listingNote = [
    `公開中 ${summary.publishedListings}件`,
    summary.draftListings > 0 ? `下書き ${summary.draftListings}件` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return [
    {
      href: "/mypage/listings",
      label: "出品した商品",
      icon: Package,
      note: listingNote,
      action:
        summary.awaitingShipment > 0
          ? `発送・受渡のご連絡をお待ちの取引が${summary.awaitingShipment}件あります`
          : undefined,
    },
    {
      href: "/mypage/purchases",
      label: "購入した取引",
      icon: ShoppingBag,
      note:
        summary.activePurchases > 0
          ? `進行中 ${summary.activePurchases}件`
          : "進行中の取引はありません",
      action:
        summary.awaitingReceipt > 0
          ? `受取確認をお待ちの取引が${summary.awaitingReceipt}件あります`
          : undefined,
    },
    {
      href: "/mypage/favorites",
      label: "お気に入り",
      icon: Heart,
      note: `${summary.favorites}件`,
    },
    { href: "/mypage/profile", label: "プロフィール編集", icon: UserPen },
    { href: "/mypage/settings", label: "設定", icon: Settings },
  ];
}

export default async function MyPage() {
  const user = await requireUser("/mypage");
  const avatarSrc = avatarImageUrl(user.avatarUrl);
  const prefecture = labelOf(PREFECTURES, user.prefecture);
  const menu = buildMenu(await getMyPageSummary(user.id));

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
          />
        ) : (
          <Avatar className="size-16">
            <AvatarFallback className="text-lg">
              {user.displayName.slice(0, 1) || "U"}
            </AvatarFallback>
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
          {menu.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.label}</span>
                    {item.note && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {item.note}
                      </span>
                    )}
                    {item.action && (
                      <span className="mt-0.5 block text-xs font-medium text-primary">
                        {item.action}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
