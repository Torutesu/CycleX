import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";

/**
 * サーバー側からだけ呼ぶスレッド操作。
 *
 * actions.ts に置くと "use server" の対象になり、引数で渡した利用者 ID が
 * そのままブラウザから指定できてしまう(他人になりすまして既読にしたり、
 * スレッドを作れてしまう)。呼び出し元はサーバーコンポーネントだけなので、
 * ここに分けて外から呼べないようにする。
 */

/** スレッド表示時に相手発信の未読をまとめて既読にする */
export async function markThreadRead(threadId: string, userId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .neq("sender_id", userId)
    .is("read_at", null);
}

/**
 * 取引画面からスレッドを開く。無ければ作成してから遷移する。
 * 取引成立後の連絡は購入前と同じスレッドで継続する(FR-07)。
 */
export async function openThreadForListing(listingId: string, buyerId: string): Promise<string> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("threads")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("threads")
    .insert({ listing_id: listingId, buyer_id: buyerId })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[thread insert failed]", error);
    throw new AppError("やり取りの開始に失敗しました。");
  }
  return created.id;
}
