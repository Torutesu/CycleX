"use client";

import { ConfirmButton } from "@/features/admin/components/admin-actions";
import { setReviewHidden } from "@/features/admin/actions";

/** FR-10: 管理者による評価の非表示化と解除 */
export function ReviewHideButton({ reviewId, hidden }: { reviewId: string; hidden: boolean }) {
  return hidden ? (
    <ConfirmButton
      label="非表示を解除"
      confirmTitle="評価の非表示を解除しますか?"
      confirmDescription="公開条件を満たしている評価は、再びプロフィールに表示されます。"
      onConfirm={() => setReviewHidden(reviewId, false)}
      successMessage="評価を再表示しました"
    />
  ) : (
    <ConfirmButton
      label="非表示にする"
      confirmTitle="この評価を非表示にしますか?"
      confirmDescription="プロフィールと平均★から除外されます。評価そのものは削除されず、いつでも解除できます。"
      onConfirm={() => setReviewHidden(reviewId, true)}
      successMessage="評価を非表示にしました"
      variant="destructive"
    />
  );
}
