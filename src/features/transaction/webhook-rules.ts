import type { TransactionStatus } from "@/lib/constants";

/**
 * Stripe Webhook の分岐判定(FR-09)。
 *
 * Stripe は同じイベントを再送するため、処理は必ず冪等でなければならない。
 * DB へ触れない判定だけをここに置き、副作用は webhook.ts が行う。
 */

export type WebhookDecision =
  | { kind: "apply" }
  /** すでに処理済み。200 を返して終わる */
  | { kind: "skip"; reason: string }
  /** 復旧不能な入力。ログに残して 200 を返す */
  | { kind: "invalid"; reason: string };

/** checkout.session.completed をどう扱うか */
export function decideCompleted(
  transactionId: string | null | undefined,
  currentStatus: TransactionStatus | null,
): WebhookDecision {
  if (!transactionId) {
    return { kind: "invalid", reason: "metadata.transaction_id がありません" };
  }
  if (currentStatus === null) {
    return { kind: "invalid", reason: `取引が見つかりません: ${transactionId}` };
  }
  if (currentStatus !== "pending_payment") {
    return { kind: "skip", reason: `すでに ${currentStatus} のため処理済み` };
  }
  return { kind: "apply" };
}

/** checkout.session.expired をどう扱うか */
export function decideExpired(
  transactionId: string | null | undefined,
  currentStatus: TransactionStatus | null,
): WebhookDecision {
  if (!transactionId) {
    return { kind: "invalid", reason: "metadata.transaction_id がありません" };
  }
  if (currentStatus === null) {
    return { kind: "invalid", reason: `取引が見つかりません: ${transactionId}` };
  }
  if (currentStatus !== "pending_payment") {
    // 決済が先に確定していた場合は期限切れを無視する
    return { kind: "skip", reason: `すでに ${currentStatus} のため無視` };
  }
  return { kind: "apply" };
}

/** Stripe の payment_intent フィールドから ID を取り出す */
export function paymentIntentIdOf(
  paymentIntent: string | { id: string } | null | undefined,
): string | null {
  if (!paymentIntent) return null;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
}
