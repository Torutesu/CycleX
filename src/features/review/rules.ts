import { REVIEW_AUTO_PUBLISH_DAYS } from "@/lib/constants";

/**
 * 評価の公開判定(FR-10)。
 *
 * 報復評価を抑止するため、双方の評価が揃うまで相互に非公開とする。
 * 一方だけが評価したまま 14 日が経過した場合も公開し、取引を完了させる。
 */

export type ReviewInput = {
  reviewerId: string;
  createdAt: string;
};

export type PublicationDecision = {
  /** 既存の評価を公開状態にすべきか */
  publish: boolean;
  /** 取引を completed へ遷移させるべきか */
  complete: boolean;
  /** 相手に評価を促す通知を送るべきか */
  requestReview: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / DAY_MS;
}

/**
 * @param reviews    この取引に登録済みの評価(0〜2件)
 * @param receivedAt 受取確認の日時。null なら未受取
 * @param now        判定基準時刻
 */
export function resolveReviewPublication(
  reviews: ReviewInput[],
  receivedAt: string | null,
  now: Date,
): PublicationDecision {
  const unique = new Map(reviews.map((review) => [review.reviewerId, review]));
  const count = unique.size;

  // 双方が評価した → 即時公開し取引完了
  if (count >= 2) {
    return { publish: true, complete: true, requestReview: false };
  }

  if (count === 1) {
    const [only] = [...unique.values()];
    // 片方の評価から14日経過 → 公開して完了させる
    if (daysSince(only.createdAt, now) >= REVIEW_AUTO_PUBLISH_DAYS) {
      return { publish: true, complete: true, requestReview: false };
    }
    return { publish: false, complete: false, requestReview: true };
  }

  // 評価ゼロのまま受取から14日経過 → 完了だけさせる
  if (receivedAt && daysSince(receivedAt, now) >= REVIEW_AUTO_PUBLISH_DAYS) {
    return { publish: false, complete: true, requestReview: false };
  }

  return { publish: false, complete: false, requestReview: false };
}

/** 評価を登録できる状態か */
export function canSubmitReview(
  txStatus: string,
  isParticipant: boolean,
  alreadyReviewed: boolean,
): { allowed: true } | { allowed: false; reason: string } {
  if (!isParticipant) {
    return { allowed: false, reason: "この取引の当事者ではありません。" };
  }
  if (alreadyReviewed) {
    return { allowed: false, reason: "すでに評価を登録しています。評価の変更はできません。" };
  }
  if (txStatus !== "received" && txStatus !== "completed") {
    return { allowed: false, reason: "受取確認が完了してから評価できます。" };
  }
  return { allowed: true };
}
