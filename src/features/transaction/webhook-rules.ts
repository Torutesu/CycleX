import type { TransactionStatus } from "@/lib/constants";

/**
 * Stripe Webhook の分岐判定(FR-09)。
 *
 * Stripe は同じイベントを再送するため、処理は必ず冪等でなければならない。
 * DB へ触れない判定だけをここに置き、副作用は webhook.ts が行う。
 */

export type WebhookDecision =
  | { kind: "apply" }
  /**
   * キャンセル済みの取引に入金が届いた。取引は復活させないが、
   * 支払いの事実を記録して運営が返金できるようにする
   */
  | { kind: "late_payment" }
  /** すでに処理済み。200 を返して終わる */
  | { kind: "skip"; reason: string }
  /** まだ入金が確定していない。取引は保留のまま 200 を返す */
  | { kind: "defer"; reason: string }
  /**
   * 処理できない入力。`retry` が true のものは DB 側の一時障害の可能性があるため
   * 500 を返して Stripe に再送させる。false は復旧不能なので 200 で終える
   */
  | { kind: "invalid"; reason: string; retry: boolean };

/**
 * checkout.session.completed / async_payment_succeeded をどう扱うか。
 *
 * `checkout.session.completed` は「セッションが完了した」だけを意味し、入金の確定を
 * 意味しない。コンビニ払い・銀行振込のような後払い手段では payment_status が
 * `unpaid` のまま飛んでくるため、必ず入金状態を確認してから遷移させる。
 *
 * @param paymentRecorded その取引に支払いの記録(paid_at)がすでにあるか
 */
export function decideCompleted(
  transactionId: string | null | undefined,
  currentStatus: TransactionStatus | null,
  paymentStatus: string | null | undefined,
  paymentRecorded = false,
): WebhookDecision {
  if (!transactionId) {
    return { kind: "invalid", reason: "metadata.transaction_id がありません", retry: false };
  }
  if (currentStatus === null) {
    // 自分で作った取引の ID が metadata に入っているのに見つからない。
    // DB の一時障害の可能性があるので再送させる
    return { kind: "invalid", reason: `取引が見つかりません: ${transactionId}`, retry: true };
  }
  if (currentStatus === "canceled" && paymentStatus === "paid" && !paymentRecorded) {
    return { kind: "late_payment" };
  }
  if (currentStatus !== "pending_payment") {
    return { kind: "skip", reason: `すでに ${currentStatus} のため処理済み` };
  }
  // `no_payment_required` は金額0のセッション。本システムでは発生しない想定だが、
  // 入金なしで取引を成立させないよう `paid` のみを通す。
  if (paymentStatus !== "paid") {
    return {
      kind: "defer",
      reason: `入金が未確定のため保留します(payment_status=${paymentStatus ?? "不明"})`,
    };
  }
  return { kind: "apply" };
}

/** checkout.session.expired をどう扱うか */
export function decideExpired(
  transactionId: string | null | undefined,
  currentStatus: TransactionStatus | null,
): WebhookDecision {
  if (!transactionId) {
    return { kind: "invalid", reason: "metadata.transaction_id がありません", retry: false };
  }
  if (currentStatus === null) {
    return { kind: "invalid", reason: `取引が見つかりません: ${transactionId}`, retry: true };
  }
  if (currentStatus !== "pending_payment") {
    // 決済が先に確定していた場合は期限切れを無視する
    return { kind: "skip", reason: `すでに ${currentStatus} のため無視` };
  }
  return { kind: "apply" };
}

/**
 * 金額・通貨がこちらの想定と一致しているか。
 * セッションはサーバーが組み立てているので通常は一致するが、
 * 食い違いが黙って通らないよう Webhook で照合する。
 */
export function amountMatches(
  expectedPrice: number,
  amountTotal: number | null | undefined,
  currency: string | null | undefined,
): boolean {
  if (amountTotal === null || amountTotal === undefined) return false;
  return amountTotal === expectedPrice && (currency ?? "").toLowerCase() === "jpy";
}

/** Stripe の payment_intent フィールドから ID を取り出す */
export function paymentIntentIdOf(
  paymentIntent: string | { id: string } | null | undefined,
): string | null {
  if (!paymentIntent) return null;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
}
