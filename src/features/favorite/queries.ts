import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CARD_SELECT,
  toCard,
  type ListingCardData,
  type ListingRow,
} from "@/features/search/queries";
import { SEARCH_PAGE_SIZE } from "@/features/search/params";

/** 表示中の商品のうち、ログインユーザーがお気に入り登録済みの ID 集合 */
export async function getFavoritedIds(
  userId: string | null,
  listingIds: string[],
): Promise<Set<string>> {
  if (!userId || listingIds.length === 0) return new Set();

  const supabase = await createClient();
  const { data } = await supabase
    .from("favorites")
    .select("listing_id")
    .eq("user_id", userId)
    .in("listing_id", listingIds);

  return new Set((data ?? []).map((row) => row.listing_id));
}

/** 単一商品のお気に入り状態 */
export async function isFavorited(userId: string | null, listingId: string): Promise<boolean> {
  if (!userId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("favorites")
    .select("listing_id")
    .eq("user_id", userId)
    .eq("listing_id", listingId)
    .maybeSingle();
  return Boolean(data);
}

export type FavoriteListPage = {
  items: ListingCardData[];
  total: number;
  totalPages: number;
};

/**
 * お気に入り一覧(FR-06)。登録日時の新しい順、24 件ずつ。
 *
 * RLS 越しに listings を結合すると、取下げ・運営非表示になった商品が
 * 本人に見えず一覧から黙って消えていた。要件は「その旨表示」なので
 * service role で状態ごと取得し、カード側で到達不能として描画する。
 */
export async function getFavoriteListings(userId: string, page: number): Promise<FavoriteListPage> {
  const supabase = createAdminClient();
  const from = (Math.max(1, page) - 1) * SEARCH_PAGE_SIZE;

  const { data, count, error } = await supabase
    .from("favorites")
    .select(`listing_id, created_at, listings!inner(${CARD_SELECT})`, { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, from + SEARCH_PAGE_SIZE - 1);

  if (error) {
    console.error("[favorites list failed]", error);
    return { items: [], total: 0, totalPages: 1 };
  }

  const total = count ?? 0;
  return {
    items: (data ?? [])
      .map((row) => row.listings)
      .filter(Boolean)
      .map((listing) => toCard(listing as unknown as ListingRow)),
    total,
    totalPages: Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE)),
  };
}
