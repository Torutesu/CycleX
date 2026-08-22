import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ヘッダー・タブバーに表示する未読メッセージの合計件数。
 *
 * 自分が参加するスレッド(買い手として、または自分の出品への問い合わせ)のうち、
 * 相手が送信して未読のメッセージを数える。
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createAdminClient();

  const { data: threads, error } = await supabase
    .from("threads")
    .select("id, buyer_id, listings!inner(seller_id)")
    .or(`buyer_id.eq.${userId},listings.seller_id.eq.${userId}`);

  if (error || !threads || threads.length === 0) return 0;

  const threadIds = threads.map((thread) => thread.id);

  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .in("thread_id", threadIds)
    .neq("sender_id", userId)
    .is("read_at", null);

  return count ?? 0;
}
