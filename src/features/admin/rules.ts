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
export function listingAfterCancel(
  currentListingStatus: ListingStatus,
): ListingStatus | null {
  return listingStatusFor("canceled", currentListingStatus);
}

/** キャンセル可能な取引ステータスか */
export function isCancellable(status: TransactionStatus): boolean {
  return status !== "completed" && status !== "canceled";
}
