import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 運営が未対応の、取引の問題の申告があるか。
 * あるあいだは取引を完了させない(完了すると運営もキャンセルできなくなる)。
 */
export async function hasOpenTransactionReport(transactionId: string): Promise<boolean> {
  const { count } = await createAdminClient()
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("target_type", "transaction")
    .eq("target_id", transactionId)
    .eq("status", "open");
  return (count ?? 0) > 0;
}
