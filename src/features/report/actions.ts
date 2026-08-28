"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireVerifiedUser } from "@/lib/session";
import { assertRateLimit } from "@/lib/rate-limit";
import { ok, fail, toUserMessage, AppError, isUniqueViolation, type ActionResult } from "@/lib/errors";
import { REPORT_DETAIL_MAX, REPORT_REASONS, optionValues } from "@/lib/constants";

const reportSchema = z.object({
  targetType: z.enum(["listing", "user"]),
  targetId: z.uuid("対象が正しく指定されていません"),
  reason: z.enum(optionValues(REPORT_REASONS)),
  detail: z
    .string()
    .trim()
    .max(REPORT_DETAIL_MAX, `詳細は${REPORT_DETAIL_MAX}文字以内で入力してください`)
    .optional()
    .transform((value) => (value ? value : null)),
});

/**
 * FR-11: 商品・利用者の通報。
 * 同一ユーザーが同一対象を重ねて通報できるのは、前の通報が対応済みになるまで1件
 * (部分ユニークインデックス)。対応後に再び問題が起きた場合は改めて通報できる。
 * 通報者の情報は被通報者に開示しない。
 */
export async function submitReport(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const user = await requireVerifiedUser();

    const parsed = reportSchema.safeParse({
      targetType: formData.get("targetType"),
      targetId: formData.get("targetId"),
      reason: formData.get("reason"),
      detail: formData.get("detail") ?? "",
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }

    const { targetType, targetId, reason, detail } = parsed.data;
    const supabase = createAdminClient();

    // 対象の存在確認と、自分自身の通報を防ぐ
    if (targetType === "user") {
      if (targetId === user.id) throw new AppError("自分自身は通報できません。");
      const { data } = await supabase.from("users").select("id").eq("id", targetId).maybeSingle();
      if (!data) throw new AppError("対象の利用者が見つかりません。");
    } else {
      const { data } = await supabase
        .from("listings")
        .select("id, seller_id")
        .eq("id", targetId)
        .maybeSingle();
      if (!data) throw new AppError("対象の商品が見つかりません。");
      if (data.seller_id === user.id) throw new AppError("自分が出品した商品は通報できません。");
    }

    await assertRateLimit(user.id, "report_submit");

    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      detail,
    });

    if (error) {
      if (isUniqueViolation(error)) {
        throw new AppError("この対象は現在対応中です。対応が完了するまでお待ちください。");
      }
      console.error("[report insert failed]", error);
      throw new AppError("通報の送信に失敗しました。時間をおいて再度お試しください。");
    }

    revalidatePath("/admin/reports");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}
