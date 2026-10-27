"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireVerifiedUser } from "@/lib/session";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  ok,
  fail,
  toUserMessage,
  AppError,
  isUniqueViolation,
  type ActionResult,
} from "@/lib/errors";
import { notifyTransactionReport } from "@/features/notification/notify";
import { REPORT_DETAIL_MAX, reportReasonsFor } from "@/lib/constants";

const reportSchema = z.object({
  targetType: z.enum(["listing", "user", "transaction"]),
  targetId: z.uuid("対象が正しく指定されていません"),
  reason: z.string(),
  detail: z
    .string()
    .trim()
    .max(REPORT_DETAIL_MAX, `詳細は${REPORT_DETAIL_MAX}文字以内で入力してください`)
    .optional()
    .transform((value) => (value ? value : null)),
});

/**
 * FR-11: 商品・利用者の通報と、取引の問題の申告(利用規約 第11条2・第14条)。
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
    if (!reportReasonsFor(targetType).some((option) => option.value === reason)) {
      return fail("理由を選択してください");
    }
    const supabase = createAdminClient();

    // 対象の存在確認と、自分自身の通報を防ぐ
    if (targetType === "user") {
      if (targetId === user.id) throw new AppError("自分自身は通報できません。");
      const { data } = await supabase.from("users").select("id").eq("id", targetId).maybeSingle();
      if (!data) throw new AppError("対象の利用者が見つかりません。");
    } else if (targetType === "transaction") {
      // 取引の申告は、その取引の当事者だけができる
      const { data } = await supabase
        .from("transactions")
        .select("id, buyer_id, seller_id")
        .eq("id", targetId)
        .maybeSingle();
      if (!data || (data.buyer_id !== user.id && data.seller_id !== user.id)) {
        throw new AppError("対象の取引が見つかりません。");
      }
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
        throw new AppError(
          targetType === "transaction"
            ? "この取引の申告は運営で確認中です。対応が完了するまでお待ちください。"
            : "この対象は現在対応中です。対応が完了するまでお待ちください。",
        );
      }
      console.error("[report insert failed]", error);
      throw new AppError("送信に失敗しました。時間をおいて再度お試しください。");
    }

    // 取引の問題は返金や発送の期限に関わるため、運営へすぐ知らせる。
    // 知らせられなくても申告そのものは受け付けている(管理画面の通報一覧に出る)
    if (targetType === "transaction") {
      await notifyTransactionReport(targetId, reason, detail).catch((notifyError) =>
        console.error("[transaction report notify failed]", notifyError),
      );
    }

    revalidatePath("/admin/reports");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}
