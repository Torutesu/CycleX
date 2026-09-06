import type { ListingStatus, TransactionStatus, UserStatus } from "@/lib/constants";
import { listingStatusFor } from "@/features/transaction/state";

/**
 * 管理操作の可否判定(FR-11 / FR-12)。
 * DB へ触れない判定のみを置き、actions.ts から利用する。
 */

export type AdminCheck = { allowed: true } | { allowed: false; reason: string };

/** 利用者を利用停止にできるか */
export function canSuspendUser(
  targetId: string,
  adminId: string,
  role: string,
  status: UserStatus,
): AdminCheck {
  if (targetId === adminId) {
    return { allowed: false, reason: "自分自身を利用停止にはできません。" };
  }
  if (role === "admin") {
    return { allowed: false, reason: "管理者を利用停止にはできません。" };
  }
  if (status === "withdrawn") {
    return { allowed: false, reason: "退会済みの利用者です。" };
  }
  if (status === "suspended") {
    return { allowed: false, reason: "すでに利用停止中です。" };
  }
  return { allowed: true };
}

/** 利用停止に伴って非表示にする出品のステータス */
export const SUSPENDABLE_LISTING_STATUSES: readonly ListingStatus[] = [
  "published",
  "withdrawn",
  "draft",
];

/**
 * 進行中の取引を抱えた利用者を停止できるか(S2-6)。
 *
 * 停止するとログインできなくなるため、出品者は発送操作ができず、
 * 購入者は支払ったまま何も受け取れない状態で取引が止まる。
 * 先に取引を処理してもらう運用とし、停止はその後に行う。
 *
 * 違反への即応が必要な場合は、取引と無関係に実行できる
 * 「商品の非表示」で出品を止められる。
 */
export function canSuspendUserWithTransactions(activeTransactionCount: number): AdminCheck {
  if (activeTransactionCount > 0) {
    return {
      allowed: false,
      reason:
        `進行中の取引が${activeTransactionCount}件あるため利用停止にできません。` +
        "先に取引をキャンセル(必要なら返金)してから実行してください。" +
        "出品をすぐ止めたい場合は、商品の非表示をご利用ください。",
    };
  }
  return { allowed: true };
}

/** 商品を非表示にできるか(取引中・売却済は不可) */
export function canSuspendListing(status: ListingStatus): AdminCheck {
  if (status === "trading" || status === "sold") {
    return {
      allowed: false,
      reason: "取引中・売却済みの商品は非表示にできません。先に取引をキャンセルしてください。",
    };
  }
  if (status === "suspended") {
    return { allowed: false, reason: "すでに非表示です。" };
  }
  return { allowed: true };
}

/** 取引キャンセル時に商品がどう戻るか(管理画面の警告表示に使う) */
export function listingAfterCancel(currentListingStatus: ListingStatus): ListingStatus | null {
  return listingStatusFor("canceled", currentListingStatus);
}

/** キャンセル可能な取引ステータスか */
export function isCancellable(status: TransactionStatus): boolean {
  return status !== "completed" && status !== "canceled";
}

/**
 * 運営による返金対応が必要な取引か(FR-08 / 別紙1 3.(4))。
 *
 * 入金済み(paid_at あり)のままキャンセルされた取引は、購入者の支払いだけが
 * 残っている状態になる。返金 API の実装は対象外のため、この判定で対象を洗い出し、
 * 運営が Stripe ダッシュボードから手動で返金する。
 */
export function needsRefund(status: TransactionStatus, paidAt: string | null | undefined): boolean {
  return status === "canceled" && Boolean(paidAt);
}

/**
 * 取引と商品の状態が矛盾していないかを判定する(S2-7)。
 *
 * 取引・商品・履歴の更新は3回に分けて実行しているため、途中でプロセスが落ちると
 * 「取引は完了なのに商品は取引中のまま」のような状態が残りうる。
 * 発生確率は低いが、起きたときに気づける必要があるため日次で照合する。
 *
 * @returns 矛盾している場合はその内容、正常なら null
 */
export function detectStateMismatch(
  txStatus: TransactionStatus,
  listingStatus: ListingStatus,
): string | null {
  const expected = listingStatusFor(txStatus, listingStatus);
  // listingStatusFor は「今のままでよい」場合に null を返す
  if (expected === null || expected === listingStatus) return null;

  return `取引が「${txStatus}」なので商品は「${expected}」であるべきですが、「${listingStatus}」になっています`;
}
