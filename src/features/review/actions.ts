"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireVerifiedUser } from "@/lib/session";
import { ok, fail, toUserMessage, AppError, type ActionResult } from "@/lib/errors";
import { REVIEW_COMMENT_MAX } from "@/lib/constants";
import { getTransaction, transitionTransaction } from "@/features/transaction/service";
import { canSubmitReview, resolveReviewPublication } from "@/features/review/rules";
import {
  notifyCompleted,
  notifyReviewReceived,
  notifyReviewRequested,
} from "@/features/notification/notify";

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "評価を選択してください").max(5),
  comment: z
    .string()
    .trim()
    .max(REVIEW_COMMENT_MAX, `コメントは${REVIEW_COMMENT_MAX}文字以内で入力してください`)
    .optional()
    .transform((value) => (value ? value : null)),
});

/**
 * FR-10: 相互評価の登録。
 * 双方が登録した時点(または一方から14日経過)で公開し、取引を完了させる。
 */
export async function submitReview(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const user = await requireVerifiedUser();
    const transactionId = String(formData.get("transactionId") ?? "");

    const parsed = reviewSchema.safeParse({
      rating: formData.get("rating"),
      comment: formData.get("comment") ?? "",
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }

    const transaction = await getTransaction(transactionId);
    if (!transaction) throw new AppError("取引が見つかりません。");

    const isParticipant =
      transaction.buyerId === user.id || transaction.sellerId === user.id;
    const revieweeId =
      transaction.buyerId === user.id ? transaction.sellerId : transaction.buyerId;

    const supabase = createAdminClient();
    const { data: existingReviews } = await supabase
      .from("reviews")
      .select("reviewer_id, created_at")
      .eq("transaction_id", transactionId);

    const alreadyReviewed = (existingReviews ?? []).some(
      (review) => review.reviewer_id === user.id,
    );

    const check = canSubmitReview(transaction.status, isParticipant, alreadyReviewed);
    if (!check.allowed) throw new AppError(check.reason);

    const { error: insertError } = await supabase.from("reviews").insert({
      transaction_id: transactionId,
      reviewer_id: user.id,
      reviewee_id: revieweeId,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
      is_published: false,
    });

    if (insertError) {
      console.error("[review insert failed]", insertError);
      throw new AppError("評価の登録に失敗しました。時間をおいて再度お試しください。");
    }

    // 公開判定は INSERT のあとに読み直した結果で決める。
    // 事前に読んだ一覧で判定すると、双方がほぼ同時に投稿したときに
    // 両方が「相手はまだ」と判断してしまい、日次バッチが拾う14日後まで完了しない。
    const { data: allReviews } = await supabase
      .from("reviews")
      .select("reviewer_id, created_at")
      .eq("transaction_id", transactionId);

    const reviews = (allReviews ?? []).map((review) => ({
      reviewerId: review.reviewer_id,
      createdAt: review.created_at,
    }));

    const decision = resolveReviewPublication(reviews, transaction.receivedAt, new Date());

    if (decision.publish) {
      await supabase
        .from("reviews")
        .update({ is_published: true })
        .eq("transaction_id", transactionId);
    }

    if (decision.complete) {
      const latest = await getTransaction(transactionId);
      if (latest && latest.status === "received") {
        await transitionTransaction(latest, "completed", "system", {
          note: "双方の評価が完了",
        });
        await notifyCompleted(transactionId);
      }
    }

    if (decision.requestReview) {
      await notifyReviewRequested(transactionId, user.id);
    } else if (decision.publish) {
      await notifyReviewReceived(transactionId, revieweeId);
    }

    revalidatePath(`/transactions/${transactionId}`);
    revalidatePath(`/users/${revieweeId}`);
    revalidatePath("/mypage/purchases");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}
