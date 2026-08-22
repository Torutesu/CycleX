import "server-only";

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransaction, transitionTransaction } from "@/features/transaction/service";
import { notifyPaid } from "@/features/notification/notify";
import {
  decideCompleted,
  decideExpired,
  paymentIntentIdOf,
} from "@/features/transaction/webhook-rules";

export type WebhookOutcome =
  | { handled: true; action: "paid" | "expired" | "already_processed" }
  | { handled: false; reason: string };

/**
 * checkout.session.completed の処理(FR-09)。
 *
 * 決済確定はこの経路のみを正とする。成功画面への戻りでは取引を成立させない。
 * Stripe はリトライするため冪等に作る(判定は webhook-rules.ts)。
 */
export async function handleCheckoutCompleted(
  session: Pick<Stripe.Checkout.Session, "id" | "metadata" | "payment_intent">,
): Promise<WebhookOutcome> {
  const transactionId = session.metadata?.transaction_id;
  const transaction = transactionId ? await getTransaction(transactionId) : null;
  const decision = decideCompleted(transactionId, transaction?.status ?? null);

  if (decision.kind === "invalid") return { handled: false, reason: decision.reason };
  if (decision.kind === "skip") return { handled: true, action: "already_processed" };

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
 * checkout.session.expired の処理。
 * 未決済のまま期限切れになった取引をキャンセルし、商品を購入可能に戻す。
 */
export async function handleCheckoutExpired(
  session: Pick<Stripe.Checkout.Session, "id" | "metadata">,
): Promise<WebhookOutcome> {
  const transactionId = session.metadata?.transaction_id;
  const transaction = transactionId ? await getTransaction(transactionId) : null;
  const decision = decideExpired(transactionId, transaction?.status ?? null);

  if (decision.kind === "invalid") return { handled: false, reason: decision.reason };
  if (decision.kind === "skip") return { handled: true, action: "already_processed" };

  await transitionTransaction(transaction!, "canceled", "system", {
    patch: { canceled_reason: "payment_expired" },
    note: "Checkout セッションの有効期限切れ",
  });

  return { handled: true, action: "expired" };
}

/**
 * 未決済のまま放置された取引を掃除する(Webhook 取りこぼしの保険)。
 * @returns キャンセルした件数
 */
export async function cleanupStalePendingTransactions(olderThanMinutes = 60): Promise<number> {
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
