"use client";

import Link from "next/link";
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
 *
 * どちらも URL クエリで状態を持つ。追加読み込みは `pages`(何ページ分を続けて
 * 表示しているか)を書き換えるので、その URL を開き直しても画面と同じ範囲が出る。
 * `page` だけを進める書き方だと、共有された URL では前半が抜け落ちてしまう。
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
  // 表示済みの最後のページ。`?page=3&pages=2` なら 4 ページ目まで出ている
  const [loadedPage, setLoadedPage] = useState(params.page + params.pages - 1);
  const [pending, startTransition] = useTransition();

  const hasMore = loadedPage < totalPages;
  const remaining = totalPages - loadedPage;

  function loadMore() {
    const nextPage = loadedPage + 1;
    startTransition(async () => {
      try {
        // 取得するのは次の 1 ページ分だけ
        const query = toQueryString(params, { page: nextPage, pages: 1 });
        const raw = Object.fromEntries(new URLSearchParams(query).entries());
        const result = await loadMoreListings(raw);
        setItems((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...result.items.filter((item) => !seen.has(item.id))];
        });
        setFavorited((prev) => new Set([...prev, ...result.favoritedIds]));
        setLoadedPage(nextPage);
        // 共有・再訪で同じ範囲が出るよう、開始ページと積み上げ数を URL に反映する
        const shareQuery = toQueryString(params, {
          page: params.page,
          pages: nextPage - params.page + 1,
        });
        window.history.replaceState(
          window.history.state,
          "",
          `/search${shareQuery ? `?${shareQuery}` : ""}`,
        );
      } catch {
        toast.error("読み込みに失敗しました。時間をおいて再度お試しください。");
      }
    });
  }

  // 途中のページから始まる URL を開いた人に前半への戻り道を残す(スマホにページ送りは出ない)
  const fromStartQuery = toQueryString(params, { page: 1, pages: 1 });

  return (
    <>
      {params.page > 1 && (
        <div className="mt-5 lg:hidden">
          <Button asChild variant="outline" className="h-11 w-full">
            <Link href={`/search${fromStartQuery ? `?${fromStartQuery}` : ""}`}>
              最初から表示する
            </Link>
          </Button>
        </div>
      )}

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
            {pending ? "読み込み中..." : `もっと見る(残り${remaining}ページ)`}
          </Button>
        </div>
      )}

      <div className="hidden lg:block">
        <SearchPagination params={params} totalPages={totalPages} />
      </div>
    </>
  );
}
