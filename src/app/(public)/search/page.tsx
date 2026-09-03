import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListingGrid } from "@/components/listing/listing-grid";
import { QuickFilters } from "@/features/search/components/quick-filters";
import { EmptyState } from "@/components/common/empty-state";
import { FilterPanel } from "@/features/search/components/filter-panel";
import {
  ActiveFilterChips,
  MobileFilterSheet,
  SortSelect,
} from "@/features/search/components/search-controls";
import { SearchPagination } from "@/features/search/components/pagination";
import { SearchResults, SearchTransition } from "@/features/search/components/search-transition";
import { getBrandOptions, searchListings } from "@/features/search/queries";
import { getFavoritedIds } from "@/features/favorite/queries";
import {
  parseSearchParams,
  hasActiveFilters,
  SEARCH_PAGE_SIZE,
} from "@/features/search/params";
import { getCurrentUser } from "@/lib/session";
import { CATEGORIES, labelOf } from "@/lib/constants";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = parseSearchParams(await searchParams);
  const parts = [params.q, params.category ? labelOf(CATEGORIES, params.category) : null].filter(
    Boolean,
  );

  return {
    title: parts.length > 0 ? `${parts.join(" ")} の検索結果` : "商品をさがす",
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseSearchParams(await searchParams);

  const [result, brands, user] = await Promise.all([
    searchListings(params),
    getBrandOptions(),
    getCurrentUser(),
  ]);

  const favoritedIds = await getFavoritedIds(
    user?.id ?? null,
    result.items.map((item) => item.id),
  );

  // 「何件中の何件目を見ているか」まで出す。ページ送りのときに位置が分かる
  const currentPage = Math.min(params.page, Math.max(1, result.totalPages));
  const firstOnPage = (currentPage - 1) * SEARCH_PAGE_SIZE + 1;
  const countLabel =
    result.total === 0
      ? "0件"
      : result.totalPages > 1
        ? `${result.total.toLocaleString()}件中 ${firstOnPage.toLocaleString()}〜${(
            firstOnPage +
            result.items.length -
            1
          ).toLocaleString()}件`
        : `${result.total.toLocaleString()}件`;

  return (
    <SearchTransition>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="lg:flex lg:gap-8">
          {/* PC: サイドバー / スマホ: ボトムシート(FR-04-2) */}
          <aside className="hidden w-64 shrink-0 lg:block">
            <div className="sticky top-24 max-h-[calc(100dvh-8rem)] overflow-hidden">
              <FilterPanel params={params} brands={brands} />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <header className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-xl font-bold">
                  {params.q ? `「${params.q}」の検索結果` : "商品をさがす"}
                  <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
                    {countLabel}
                  </span>
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <MobileFilterSheet params={params} brands={brands} />
                <div className="ml-auto">
                  <SortSelect params={params} />
                </div>
              </div>

              <QuickFilters params={params} />

              <ActiveFilterChips params={params} brands={brands} />
            </header>

            <SearchResults>
              {result.items.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title="条件に合う商品が見つかりませんでした"
                  description="キーワードを短くするか、絞り込みを減らしてみてください。ブランド名はカタカナでも探せます。"
                  action={
                    (hasActiveFilters(params) || params.q) && (
                      <Button asChild variant="outline" className="h-11">
                        <Link href="/search">条件をクリアして表示</Link>
                      </Button>
                    )
                  }
                />
              ) : (
                <>
                  <ListingGrid
                    listings={result.items}
                    favoritedIds={favoritedIds}
                    isLoggedIn={Boolean(user)}
                    className="mt-5"
                  />
                  <SearchPagination params={params} totalPages={result.totalPages} />
                </>
              )}
            </SearchResults>
          </div>
        </div>
      </div>
    </SearchTransition>
  );
}
