import Link from "next/link";
import { Bike, Cog, Shapes, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListingGrid } from "@/components/listing/listing-grid";
import { getNewestListings, getPopularListings } from "@/features/search/queries";
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
  const [newest, popular, user] = await Promise.all([
    getNewestListings(12),
    getPopularListings(12),
    getCurrentUser(),
  ]);

  const favoritedIds = await getFavoritedIds(
    user?.id ?? null,
    [...newest, ...popular].map((item) => item.id),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* カテゴリ導線 */}
      <section>
        <h2 className="text-base font-semibold">カテゴリから探す</h2>
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICONS[category.value] ?? Bike;
            return (
              <li key={category.value}>
                <Link
                  href={`/search?category=${category.value}`}
                  className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border bg-card p-2 text-center transition-colors hover:border-primary hover:bg-accent/40"
                >
                  <Icon className="size-5 text-primary" aria-hidden />
                  <span className="break-keep text-xs leading-tight">{category.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 新着 */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">新着の商品</h2>
          <Link
            href="/search"
            className="inline-flex min-h-11 items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground"
          >
            すべて見る
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>

        {newest.length === 0 ? (
          <EmptyState />
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
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">注目の商品</h2>
            <Link
              href="/search?sort=popular"
              className="inline-flex min-h-11 items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground"
            >
              すべて見る
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
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

function EmptyState() {
  return (
    <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed py-14 text-center">
      <Bike className="size-10 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-medium">まだ出品がありません</p>
      <p className="mt-1 text-sm text-muted-foreground">最初の1台を出品してみませんか。</p>
      <Button asChild className="mt-6 h-11">
        <Link href="/sell">出品する</Link>
      </Button>
    </div>
  );
}
