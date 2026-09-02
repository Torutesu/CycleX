import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ACTIVE_TRANSACTION_STATUSES } from "@/lib/constants";

/**
 * マイページの各項目に出す件数と「要対応」の判定。
 *
 * 一覧を開かないと自分の状況が分からないと、発送や受取確認の抜けにつながる。
 * 入口の時点で件数と、いま自分の番かどうかが分かるようにする。
 */
export type MyPageSummary = {
  /** 公開中の出品 */
  publishedListings: number;
  /** 下書きのまま置かれている出品 */
  draftListings: number;
  /** 買い手として進行中の取引 */
  activePurchases: number;
  /** お気に入り */
  favorites: number;
  /** 自分が発送・受渡の連絡をする番の取引(出品者として) */
  awaitingShipment: number;
  /** 自分が受取確認をする番の取引(購入者として) */
  awaitingReceipt: number;
};

export async function getMyPageSummary(userId: string): Promise<MyPageSummary> {
  const supabase = await createClient();
  // head:true なので行は転送されず、件数だけが返る
  const options = { count: "exact", head: true } as const;

  const [published, drafts, purchases, favorites, shipment, receipt] = await Promise.all([
    supabase
      .from("listings")
      .select("*", options)
      .eq("seller_id", userId)
      .eq("status", "published"),
    supabase.from("listings").select("*", options).eq("seller_id", userId).eq("status", "draft"),
    supabase
      .from("transactions")
      .select("*", options)
      .eq("buyer_id", userId)
      .in("status", ACTIVE_TRANSACTION_STATUSES),
    supabase.from("favorites").select("*", options).eq("user_id", userId),
    // 入金済みでまだ発送・受渡の連絡をしていない = 出品者の番
    supabase.from("transactions").select("*", options).eq("seller_id", userId).eq("status", "paid"),
    // 発送・受渡の連絡済みでまだ受取確認をしていない = 購入者の番
    supabase
      .from("transactions")
      .select("*", options)
      .eq("buyer_id", userId)
      .eq("status", "shipped"),
  ]);

  return {
    publishedListings: published.count ?? 0,
    draftListings: drafts.count ?? 0,
    activePurchases: purchases.count ?? 0,
    favorites: favorites.count ?? 0,
    awaitingShipment: shipment.count ?? 0,
    awaitingReceipt: receipt.count ?? 0,
  };
}
