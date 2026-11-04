import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getTransaction, transitionTransaction } from "@/features/transaction/service";
import { resolveReviewPublication } from "@/features/review/rules";
import { notifyCompleted } from "@/features/notification/notify";
import { REPORT_DEADLINE_DAYS, REVIEW_AUTO_PUBLISH_DAYS } from "@/lib/constants";
import { hasOpenTransactionReport } from "@/features/report/queries";

export type ReviewBatchResult = {
  scanned: number;
  published: number;
  completed: number;
};

/**
 * 受取確認済みのまま滞留している取引を処理する(FR-10 / ADR #8)。
 *
 * - 双方が評価済みで、受取確認から申告の期間(3日)が過ぎた → 取引完了
 * - 片方だけが評価したまま14日経過 → 評価を公開し取引完了
 * - どちらも評価しないまま受取から14日経過 → 取引完了のみ
 * 運営が未対応の取引の申告があるものは完了させない(resolveReviewPublication)。
 *
 * 冪等に実行できるよう、対象は常に status='received' の取引に限定する。
 */
export async function publishOverdueReviews(now = new Date()): Promise<ReviewBatchResult> {
  const supabase = createAdminClient();
  // 完了しうるのは、受取確認から申告の期間が過ぎた取引だけ(それ以前は判定するまでもない)
  const threshold = new Date(
    now.getTime() - Math.min(REPORT_DEADLINE_DAYS, REVIEW_AUTO_PUBLISH_DAYS) * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: candidates } = await supabase
    .from("transactions")
    .select("id, received_at")
    .eq("status", "received")
    .not("received_at", "is", null)
    .lte("received_at", threshold);

  const result: ReviewBatchResult = {
    scanned: candidates?.length ?? 0,
    published: 0,
    completed: 0,
  };
  if (!candidates || candidates.length === 0) return result;

  for (const candidate of candidates) {
    const { data: reviews } = await supabase
      .from("reviews")
      .select("reviewer_id, created_at")
      .eq("transaction_id", candidate.id);

    const decision = resolveReviewPublication(
      (reviews ?? []).map((review) => ({
        reviewerId: review.reviewer_id,
        createdAt: review.created_at,
      })),
      candidate.received_at,
      now,
      await hasOpenTransactionReport(candidate.id),
    );

    if (decision.publish) {
      // 双方の評価は登録の時点で公開済みのことが多い。実際に公開へ変えたときだけ数える
      const { data: published } = await supabase
        .from("reviews")
        .update({ is_published: true })
        .eq("transaction_id", candidate.id)
        .eq("is_published", false)
        .select("id");
      if (published && published.length > 0) result.published += 1;
    }

    if (decision.complete) {
      const transaction = await getTransaction(candidate.id);
      if (transaction?.status === "received") {
        try {
          await transitionTransaction(transaction, "completed", "system", {
            note: "受取確認後の期間経過による自動完了",
          });
          await notifyCompleted(candidate.id);
          result.completed += 1;
        } catch (error) {
          console.error("[review batch] 完了処理に失敗", candidate.id, error);
        }
      }
    }
  }

  return result;
}
