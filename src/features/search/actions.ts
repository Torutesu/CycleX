"use server";

import { searchListings, type ListingCardData } from "@/features/search/queries";
import { parseSearchParams, type RawSearchParams } from "@/features/search/params";
import { getFavoritedIds } from "@/features/favorite/queries";
import { getCurrentUser } from "@/lib/session";

export type LoadMoreResult = {
  items: ListingCardData[];
  favoritedIds: string[];
  totalPages: number;
};

/**
 * FR-04-4: スマホの「もっと見る」。次のページを取得して一覧に足す。
 * 条件は URL クエリと同じ形で受け取り、サーバー側で検証してから検索する。
 */
export async function loadMoreListings(raw: RawSearchParams): Promise<LoadMoreResult> {
  const params = parseSearchParams(raw);
  const [result, user] = await Promise.all([searchListings(params), getCurrentUser()]);
  const favoritedIds = await getFavoritedIds(
    user?.id ?? null,
    result.items.map((item) => item.id),
  );
  return { items: result.items, favoritedIds: [...favoritedIds], totalPages: result.totalPages };
}
