import "server-only";

import { expireCheckoutSession } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getTransaction,
  recordEvent,
  transitionTransaction,
  type TransactionRecord,
  type TransitionOptions,
} from "@/features/transaction/service";
import type { TxRole } from "@/features/transaction/state";
import { notifyPaid } from "@/features/notification/notify";

export type CancelPendingOutcome =
  /** 未決済のままキャンセルできた */
  | {
      outcome: "canceled";
      transaction: TransactionRecord;
      /** Stripe 側の状態を確認できないまま(force で)キャンセルした */
      stripeStateUnknown: boolean;
    }
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
 *
 * `force` は運営専用の逃げ道(監査 C-1)。Stripe が応答しない・キーを取り違えた
 * などでセッションを照会すらできないと、この関数を通る 3 経路(日次バッチ・
 * 購入者の再購入・管理者キャンセル)がすべて失敗し、`uq_transactions_active`
 * のせいでその商品は誰も買えないまま固まる。管理者だけは Stripe の状態が
 * 未確認であることを承知でキャンセルできるようにし、履歴にその旨を残す。
 * 後から入金が届いた場合は `late_payment` の経路で購入者と運営の双方に通知される。
 */
export async function cancelPendingTransaction(
  transaction: TransactionRecord,
  role: TxRole,
  options: TransitionOptions & { reason: string; force?: boolean },
): Promise<CancelPendingOutcome> {
  if (transaction.status !== "pending_payment") {
    throw new Error(`未決済の取引ではありません: ${transaction.id} (${transaction.status})`);
  }

  let stripeStateUnknown = false;

  if (transaction.stripeSessionId) {
    const result = await expireCheckoutSession(transaction.stripeSessionId);

    if (result.status === "error" && !options.force) {
      // Stripe の状態が分からないままキャンセルすると A-1 の事故になる。
      // 取引は残し、期限切れ Webhook か次回のバッチに任せる
      throw new Error("決済セッションの状態を確認できなかったため、キャンセルを見送りました。");
    }

    if (result.status === "error") {
      stripeStateUnknown = true;
      await recordEvent(
        transaction.id,
        "canceled_without_expire",
        options.actorId ?? null,
        "Stripe の決済セッションを確認できないままキャンセルしました。入金が届いた場合は要返金として通知されます。",
      );
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
  return { outcome: "canceled", transaction: canceled, stripeStateUnknown };
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
