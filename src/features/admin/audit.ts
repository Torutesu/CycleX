import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** 記録する管理操作の種別 */
export type AdminAction =
  | "suspend_user"
  | "unsuspend_user"
  | "suspend_listing"
  | "unsuspend_listing"
  | "cancel_transaction"
  | "resolve_report"
  | "create_brand"
  | "rename_brand"
  | "toggle_brand"
  | "hide_review"
  | "unhide_review"
  | "mark_refunded"
  | "force_received"
  | "force_completed";

export type AuditTargetType = "user" | "listing" | "transaction" | "brand" | "report" | "review";

/**
 * 管理操作の記録(S3-6)。
 *
 * 取引以外の管理操作(利用停止・非表示・ブランド変更)には履歴が残っていなかった。
 * 誰が何をしたかを後から追えるようにする。
 *
 * 記録の失敗で管理操作そのものを失敗させない — 監査は補助であり、
 * 記録できなかったせいで違反対応が止まる方が害が大きい。
 */
export async function recordAdminAction(
  adminId: string,
  action: AdminAction,
  targetType: AuditTargetType,
  targetId: string | null,
  note?: string | null,
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("admin_audit_logs").insert({
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
      note: note ?? null,
    });
    if (error) console.error("[admin audit failed]", action, error);
  } catch (error) {
    console.error("[admin audit failed]", action, error);
  }
}
