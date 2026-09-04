import "server-only";

import { expireCheckoutSession } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getTransaction,
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

/**
 * 購入者が決済画面から戻ってきた(cancel_url)ときに、その人の未決済取引を片付ける。
 * 放置すると部分ユニーク索引に当たり、本人も他の人も 45 分間その商品を買えない。
 *
 * @returns 支払い済みと分かった場合はその取引 ID(取引画面へ案内する)
 */
export async function cancelBuyerPendingForListing(
  listingId: string,
  buyerId: string,
): Promise<{ paidTransactionId: string | null }> {
  const supabase = createAdminClient();
  const { data: pending } = await supabase
    .from("transactions")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .eq("status", "pending_payment")
    .maybeSingle();
  if (!pending) return { paidTransactionId: null };

  const transaction = await getTransaction(pending.id);
  if (!transaction || transaction.status !== "pending_payment") return { paidTransactionId: null };

  try {
    const result = await cancelPendingTransaction(transaction, "system", {
      reason: "canceled_by_buyer",
      note: "購入者が決済画面から戻った",
      actorId: buyerId,
    });
    return { paidTransactionId: result.outcome === "paid" ? transaction.id : null };
  } catch (error) {
    console.error("[cancel by buyer failed]", transaction.id, error);
    return { paidTransactionId: null };
  }
}
