import "server-only";

import { createClient } from "@/lib/supabase/server";

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
