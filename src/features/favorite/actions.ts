"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { ok, fail, type ActionResult } from "@/lib/errors";

export type FavoriteResult = ActionResult<{ favorited: boolean }>;

/**
 * FR-06: お気に入りの登録/解除。
 * 件数は DB トリガーが listings.favorites_count へ同期する。
 */
export async function toggleFavorite(listingId: string): Promise<FavoriteResult> {
  const user = await getCurrentUser();
  if (!user) {
    return fail("お気に入りの登録にはログインが必要です。");
  }
  if (user.status !== "active") {
    return fail("現在のアカウント状態ではこの操作は行えません。");
  }

  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("listings")
    .select("seller_id")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing) return fail("商品が見つかりません。");
  if (listing.seller_id === user.id) {
    return fail("自分が出品した商品はお気に入りに登録できません。");
  }

  const { data: existing } = await supabase
    .from("favorites")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("listing_id", listingId);
    if (error) return fail("お気に入りの解除に失敗しました。");
  } else {
    const { error } = await supabase
      .from("favorites")
      .insert({ user_id: user.id, listing_id: listingId });
    if (error) return fail("お気に入りの登録に失敗しました。");
  }

  revalidatePath("/mypage/favorites");
  revalidatePath(`/items/${listingId}`);

  return ok({ favorited: !existing });
}
