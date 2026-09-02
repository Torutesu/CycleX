import Link from "next/link";
import { Bike, Cog, PlusCircle, Search, Shapes, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { SectionHeader } from "@/components/common/section-header";
import { ListingGrid } from "@/components/listing/listing-grid";
import {
  getCategoryCounts,
  getNewestListings,
  getPopularListings,
} from "@/features/search/queries";
import { getFavoritedIds } from "@/features/favorite/queries";
import { getCurrentUser } from "@/lib/session";
import { CATEGORIES } from "@/lib/constants";

/**
 * カテゴリのアイコン。車体は6種すべて自転車なので同じ記号でよいが、
 * パーツとその他だけは自転車ではないため実態に合わせる。
 */
const CATEGORY_ICONS: Record<string, typeof Bike> = {
  parts: Cog,
  other: Shapes,
};

export default async function HomePage() {
  const [newest, popular, counts, user] = await Promise.all([
    getNewestListings(12),
    getPopularListings(8),
    getCategoryCounts(),
    getCurrentUser(),
  ]);

  const favoritedIds = await getFavoritedIds(
    user?.id ?? null,
    [...newest, ...popular].map((listing) => listing.id),
  );

  const totalListings = [...counts.values()].reduce((sum, count) => sum + count, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* 見出しはヒーローが持つ。ログイン後はヒーローを出さないので、その場合だけ補う */}
      {user && <h1 className="sr-only">CycleX ホーム</h1>}

      {/* はじめて来た人に、何のサービスかを一目で伝える */}
      {!user && (
        <section className="rounded-2xl border bg-accent/30 px-5 py-6 md:px-8 md:py-10">
          <p className="text-xs font-medium tracking-wide text-primary">
            自転車・パーツの個人間売買
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-balance md:text-3xl">
            乗らなくなった1台を、
            <br className="md:hidden" />
            次の人へ。
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            フレームサイズ・コンポーネント・走行距離まで書ける、自転車のためのフリマ。
            {totalListings > 0 && (
              <>
                {" "}
                いま<span className="font-medium text-foreground">{totalListings}台</span>
                が出品中です。
              </>
            )}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild className="h-11">
              <Link href="/search">
                <Search className="size-4" aria-hidden />
                商品をさがす
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 bg-background">
              <Link href="/sell">
                <PlusCircle className="size-4" aria-hidden />
                出品する
              </Link>
            </Button>
          </div>
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden />
            カード情報は決済代行(Stripe)が扱い、CycleXには保存されません
          </p>
        </section>
      )}

      {/* カテゴリ導線 */}
      <section className={user ? undefined : "mt-10"}>
        <SectionHeader title="カテゴリから探す" />
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICONS[category.value] ?? Bike;
            const count = counts.get(category.value) ?? 0;
            return (
              <li key={category.value}>
                <Link
                  href={`/search?category=${category.value}`}
                  className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border bg-card p-2 text-center transition-colors hover:border-primary hover:bg-accent/40"
                >
                  <Icon className="size-5 text-primary" aria-hidden />
                  <span className="break-keep text-xs leading-tight">{category.label}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{count}件</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 新着 */}
      <section className="mt-10">
        <SectionHeader
          title="新着の商品"
          description="出品されたばかりの車体とパーツ"
          href="/search"
        />

        {newest.length === 0 ? (
          <EmptyState
            icon={Bike}
            title="まだ出品がありません"
            description="最初の1台を出品してみませんか。写真と価格があれば数分で公開できます。"
            action={
              <Button asChild className="h-11">
                <Link href="/sell">出品する</Link>
              </Button>
            }
            className="mt-4 rounded-xl border border-dashed py-12"
          />
        ) : (
          <ListingGrid
            listings={newest}
            favoritedIds={favoritedIds}
            isLoggedIn={Boolean(user)}
            className="mt-4"
          />
        )}
      </section>

      {/* 人気 */}
      {popular.length > 0 && (
        <section className="mt-12">
          <SectionHeader
            title="注目の商品"
            description="お気に入りが多く集まっている出品"
            href="/search?sort=popular"
          />
          <ListingGrid
            listings={popular}
            favoritedIds={favoritedIds}
            isLoggedIn={Boolean(user)}
            className="mt-4"
          />
        </section>
      )}
    </div>
  );
}
