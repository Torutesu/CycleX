import "server-only";

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { STALE_PAYMENT_CLEANUP_MINUTES } from "@/lib/constants";
import { getTransaction, transitionTransaction } from "@/features/transaction/service";
import { notifyPaid } from "@/features/notification/notify";
import {
  decideCompleted,
  decideExpired,
  paymentIntentIdOf,
} from "@/features/transaction/webhook-rules";

export type WebhookOutcome =
  | { handled: true; action: "paid" | "expired" | "already_processed" | "awaiting_payment" }
  | { handled: false; reason: string };

/**
 * checkout.session.completed / checkout.session.async_payment_succeeded の処理(FR-09)。
 *
 * 決済確定はこの経路のみを正とする。成功画面への戻りでは取引を成立させない。
 * `completed` はセッションの完了であって入金の確定ではないため、
 * payment_status が `paid` のときだけ遷移させる(判定は webhook-rules.ts)。
 * Stripe はリトライするため冪等に作る。
 */
export async function handleCheckoutCompleted(
  session: Pick<
    Stripe.Checkout.Session,
    "id" | "metadata" | "payment_intent" | "payment_status"
  >,
): Promise<WebhookOutcome> {
  const transactionId = session.metadata?.transaction_id;
  const transaction = transactionId ? await getTransaction(transactionId) : null;
  const decision = decideCompleted(
    transactionId,
    transaction?.status ?? null,
    session.payment_status,
  );

  if (decision.kind === "invalid") return { handled: false, reason: decision.reason };
  if (decision.kind === "skip") return { handled: true, action: "already_processed" };
  if (decision.kind === "defer") {
    // 後払い手段の入金待ち。async_payment_succeeded / _failed で決着させる。
    console.info("[stripe webhook] 入金待ちのため保留:", decision.reason);
    return { handled: true, action: "awaiting_payment" };
  }

  await transitionTransaction(transaction!, "paid", "system", {
    patch: {
      stripe_payment_intent_id: paymentIntentIdOf(session.payment_intent),
      stripe_session_id: session.id,
    },
  });

  await notifyPaid(transaction!.id);
  return { handled: true, action: "paid" };
}

/**
 * checkout.session.expired / checkout.session.async_payment_failed の処理。
 * 未決済のままの取引をキャンセルし、商品を購入可能に戻す。
 */
export async function handleCheckoutExpired(
  session: Pick<Stripe.Checkout.Session, "id" | "metadata">,
  reason: "payment_expired" | "payment_failed" = "payment_expired",
): Promise<WebhookOutcome> {
  const transactionId = session.metadata?.transaction_id;
  const transaction = transactionId ? await getTransaction(transactionId) : null;
  const decision = decideExpired(transactionId, transaction?.status ?? null);

  if (decision.kind === "invalid") return { handled: false, reason: decision.reason };
  if (decision.kind !== "apply") return { handled: true, action: "already_processed" };

  await transitionTransaction(transaction!, "canceled", "system", {
    patch: { canceled_reason: reason },
    note:
      reason === "payment_failed"
        ? "後払いの入金が確認できませんでした"
        : "Checkout セッションの有効期限切れ",
  });

  return { handled: true, action: "expired" };
}

/**
 * 未決済のまま放置された取引を掃除する(Webhook 取りこぼしの保険)。
 *
 * 現在の決済手段はカードのみで、Checkout の期限は
 * `CHECKOUT_EXPIRES_MINUTES` 分。掃除はその後に効くよう設定している。
 *
 * 注意: コンビニ払い・銀行振込を追加する場合、入金までに数日かかるため
 * この掃除がまだ支払われていない取引を先に潰してしまう。後払い手段を有効にする際は
 * `pending_payment` のうち「後払い待ち」を区別できるようにしてから閾値を見直すこと。
 *
 * @returns キャンセルした件数
 */
export async function cleanupStalePendingTransactions(
  olderThanMinutes = STALE_PAYMENT_CLEANUP_MINUTES,
): Promise<number> {
  const supabase = createAdminClient();
  const threshold = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("transactions")
    .select("id")
    .eq("status", "pending_payment")
    .lt("created_at", threshold);

  if (!data || data.length === 0) return 0;

  let canceled = 0;
  for (const row of data) {
    const transaction = await getTransaction(row.id);
    if (!transaction || transaction.status !== "pending_payment") continue;

    try {
      await transitionTransaction(transaction, "canceled", "system", {
        patch: { canceled_reason: "payment_timeout" },
        note: "未決済のまま期限を超過",
      });
      canceled += 1;
    } catch (error) {
      console.error("[cleanup failed]", row.id, error);
    }
  }

  return canceled;
}
