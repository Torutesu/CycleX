import "server-only";

import { expireCheckoutSession } from "@/lib/stripe";
import {
  transitionTransaction,
  type TransactionRecord,
  type TransitionOptions,
} from "@/features/transaction/service";
import type { TxRole } from "@/features/transaction/state";
import { notifyPaid } from "@/features/notification/notify";

export type CancelPendingOutcome =
  /** 未決済のままキャンセルできた */
  | { outcome: "canceled"; transaction: TransactionRecord }
  /** Stripe 側ではすでに支払いが完了していたため、キャンセルせず paid にした */
  | { outcome: "paid"; transaction: TransactionRecord };

/**
 * 未決済(pending_payment)の取引をキャンセルする唯一の経路。
 *
 * DB を canceled にする前に Stripe の Checkout Session を失効させる。
 * 順序が逆だと、購入者が開いたままの決済画面から支払えてしまい、
 * 「キャンセル済みなのに代金だけ受け取った」状態になる(A-1)。
 *
 * 失効しようとして「もう支払い済み」と分かった場合はキャンセルせず、
 * 通常の決済確定と同じく paid へ遷移させる。
 */
export async function cancelPendingTransaction(
  transaction: TransactionRecord,
  role: TxRole,
  options: TransitionOptions & { reason: string },
): Promise<CancelPendingOutcome> {
  if (transaction.status !== "pending_payment") {
    throw new Error(`未決済の取引ではありません: ${transaction.id} (${transaction.status})`);
  }

  if (transaction.stripeSessionId) {
    const result = await expireCheckoutSession(transaction.stripeSessionId);

    if (result.status === "error") {
      // Stripe の状態が分からないままキャンセルすると A-1 の事故になる。
      // 取引は残し、期限切れ Webhook か次回のバッチに任せる
      throw new Error("決済セッションの状態を確認できなかったため、キャンセルを見送りました。");
    }

    if (result.status === "already_paid") {
      const paid = await transitionTransaction(transaction, "paid", "system", {
        patch: { stripe_payment_intent_id: result.paymentIntentId },
        note: "キャンセル操作時に支払い済みが判明したため決済確定",
      });
      await notifyPaid(transaction.id);
      return { outcome: "paid", transaction: paid };
    }
  }

  const canceled = await transitionTransaction(transaction, "canceled", role, {
    ...options,
    patch: { canceled_reason: options.reason, ...options.patch },
  });
  return { outcome: "canceled", transaction: canceled };
}
