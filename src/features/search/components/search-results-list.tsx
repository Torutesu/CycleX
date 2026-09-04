"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ListingGrid } from "@/components/listing/listing-grid";
import { loadMoreListings } from "@/features/search/actions";
import { toQueryString, type SearchParams } from "@/features/search/params";
import type { ListingCardData } from "@/features/search/queries";
import { SearchPagination } from "@/features/search/components/pagination";

type Props = {
  params: SearchParams;
  initialItems: ListingCardData[];
  initialFavoritedIds: string[];
  totalPages: number;
  isLoggedIn: boolean;
  currentUserId: string | null;
};

/**
 * FR-04-4: スマホは「もっと見る」で追加読み込み、PC はページ番号式。
 * どちらも URL クエリで状態を持つ(追加読み込みは page を書き換えて共有・戻るに対応)。
 */
export function SearchResultsList({
  params,
  initialItems,
  initialFavoritedIds,
  totalPages,
  isLoggedIn,
  currentUserId,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [favorited, setFavorited] = useState(() => new Set(initialFavoritedIds));
  const [page, setPage] = useState(params.page);
  const [pending, startTransition] = useTransition();

  const hasMore = page < totalPages;

  function loadMore() {
    const nextPage = page + 1;
    startTransition(async () => {
      try {
        const query = toQueryString(params, { page: nextPage });
        const raw = Object.fromEntries(new URLSearchParams(query).entries());
        const result = await loadMoreListings(raw);
        setItems((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...result.items.filter((item) => !seen.has(item.id))];
        });
        setFavorited((prev) => new Set([...prev, ...result.favoritedIds]));
        setPage(nextPage);
        // 共有・ブラウザバックで同じ位置まで戻れるよう URL にも反映する
        window.history.replaceState(window.history.state, "", `/search${query ? `?${query}` : ""}`);
      } catch {
        toast.error("読み込みに失敗しました。時間をおいて再度お試しください。");
      }
    });
  }

  return (
    <>
      <ListingGrid
        listings={items}
        favoritedIds={favorited}
        isLoggedIn={isLoggedIn}
        currentUserId={currentUserId}
        className="mt-5"
      />

      {hasMore && (
        <div className="mt-6 lg:hidden">
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full"
            disabled={pending}
            onClick={loadMore}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {pending ? "読み込み中..." : `もっと見る(${page} / ${totalPages}ページ)`}
          </Button>
        </div>
      )}

      <div className="hidden lg:block">
        <SearchPagination params={params} totalPages={totalPages} />
      </div>
    </>
  );
}
