"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireVerifiedUser } from "@/lib/session";
import { fail, toUserMessage, AppError, type ActionResult } from "@/lib/errors";
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
  let done: string;

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

    const isParticipant = transaction.buyerId === user.id || transaction.sellerId === user.id;
    const revieweeId = transaction.buyerId === user.id ? transaction.sellerId : transaction.buyerId;

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

    // 完了後(14 日経過で自動完了した取引など)の評価は報復評価の抑止対象ではないので即時公開する。
    // 非公開のまま残すと、相手が二度と評価しなければ永久に公開されない
    const decision =
      transaction.status === "completed"
        ? { publish: true, complete: false, requestReview: false }
        : resolveReviewPublication(reviews, transaction.receivedAt, new Date());

    if (decision.publish) {
      await supabase
        .from("reviews")
        .update({ is_published: true })
        .eq("transaction_id", transactionId);
    }

    if (decision.complete) {
      const latest = await getTransaction(transactionId);
      if (latest && latest.status === "received") {
        try {
          await transitionTransaction(latest, "completed", "system", {
            note: "双方の評価が完了",
          });
          await notifyCompleted(transactionId);
        } catch (error) {
          // 双方がほぼ同時に評価すると、楽観ロックで片方の遷移が負ける。
          // 相手側が完了させていれば成功扱いにする
          const after = await getTransaction(transactionId);
          if (after?.status !== "completed") throw error;
        }
      }
    }

    if (decision.requestReview) {
      await notifyReviewRequested(transactionId, user.id);
    } else if (decision.publish) {
      // 双方の評価が公開された。相手には自分の評価が、自分には相手の評価が届く
      await notifyReviewReceived(transactionId, revieweeId);
      if (reviews.length >= 2) await notifyReviewReceived(transactionId, user.id);
    }

    revalidatePath(`/transactions/${transactionId}`);
    revalidatePath(`/users/${revieweeId}`);
    revalidatePath("/mypage/purchases");
    done = transactionId;
  } catch (error) {
    return fail(toUserMessage(error));
  }

  // 移動はサーバー側で行う。
  // クライアント側で移動しようとすると、上の revalidatePath による再描画で
  // 先にフォームが画面から消え、移動の処理が走らないまま
  // 「すでに評価を登録しています」の画面に取り残される。
  redirect(`/transactions/${done}?reviewed=1`);
}
