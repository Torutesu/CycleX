import {
  REPORT_DEADLINE_DAYS,
  TRANSACTION_REPORT_REASONS,
  type Option,
  type TransactionStatus,
} from "@/lib/constants";

/**
 * 取引の問題の申告ができるかどうか(取引ルール・利用規約 第11条2)。
 *
 * - 支払い前は取引が成立していないので申告できない
 * - 購入者は、受取確認から REPORT_DEADLINE_DAYS 日以内まで
 *   (未着など、まだ受け取っていないうちは期限は始まらない)
 * - 出品者に期限は無い(購入者と連絡が取れない、など)
 */
export function canReportTransaction(
  status: TransactionStatus,
  role: "buyer" | "seller",
  receivedAt: string | null,
  now: Date,
): boolean {
  if (status === "pending_payment") return false;
  if (role === "seller") return true;
  const deadline = reportDeadline(receivedAt);
  return deadline === null || now.getTime() <= deadline.getTime();
}

/** 購入者の申告期限。受取確認の前は null(期限はまだ始まっていない) */
export function reportDeadline(receivedAt: string | null): Date | null {
  if (!receivedAt) return null;
  return new Date(new Date(receivedAt).getTime() + REPORT_DEADLINE_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * 取引の状態に応じて選べる申告の理由。
 * 双方合意のキャンセルは発送前(支払い済み)の間だけ受け付ける。
 */
export function transactionReportReasons(status: TransactionStatus): readonly Option[] {
  return TRANSACTION_REPORT_REASONS.filter(
    (option) => option.value !== "cancel_agreed" || status === "paid",
  );
}
