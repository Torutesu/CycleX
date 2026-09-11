import "server-only";

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { BATCH_LIMIT_PER_RUN, STALE_PAYMENT_CLEANUP_MINUTES } from "@/lib/constants";
import { getTransaction, recordEvent, transitionTransaction } from "@/features/transaction/service";
import { cancelPendingTransaction } from "@/features/transaction/cancel";
import {
  notifyDispute,
  notifyLatePayment,
  notifyPaid,
  notifyPaidAfterCancel,
  notifyRefundedWhileActive,
} from "@/features/notification/notify";
import {
  amountMatches,
  decideCompleted,
  decideExpired,
  paymentIntentIdOf,
} from "@/features/transaction/webhook-rules";

export type WebhookOutcome =
  | {
      handled: true;
      action:
        | "paid"
        | "late_payment_recorded"
        | "expired"
        | "already_processed"
        | "awaiting_payment"
        | "dispute_notified"
        | "refund_recorded"
        | "partial_refund_recorded"
        | "refund_needs_review";
    }
  /** retry が true のときは 500 を返して Stripe に再送させる */
  | { handled: false; reason: string; retry: boolean };

type CompletedSession = Pick<
  Stripe.Checkout.Session,
  "id" | "metadata" | "payment_intent" | "payment_status"
> &
  Partial<Pick<Stripe.Checkout.Session, "amount_total" | "currency">>;

/**
 * checkout.session.completed / checkout.session.async_payment_succeeded の処理(FR-09)。
 *
 * 決済確定はこの経路のみを正とする。成功画面への戻りでは取引を成立させない。
 * `completed` はセッションの完了であって入金の確定ではないため、
 * payment_status が `paid` のときだけ遷移させる(判定は webhook-rules.ts)。
 * Stripe はリトライするため冪等に作る。
 */
export async function handleCheckoutCompleted(session: CompletedSession): Promise<WebhookOutcome> {
  const transactionId = session.metadata?.transaction_id;
  const transaction = transactionId ? await getTransaction(transactionId) : null;
  const decision = decideCompleted(
    transactionId,
    transaction?.status ?? null,
    session.payment_status,
    Boolean(transaction?.paidAt),
  );

  if (decision.kind === "invalid") {
    return { handled: false, reason: decision.reason, retry: decision.retry };
  }
  if (decision.kind === "skip") return { handled: true, action: "already_processed" };
  if (decision.kind === "defer") {
    // 後払い手段の入金待ち。async_payment_succeeded / _failed で決着させる。
    console.info("[stripe webhook] 入金待ちのため保留:", decision.reason);
    return { handled: true, action: "awaiting_payment" };
  }

  const paymentIntentId = paymentIntentIdOf(session.payment_intent);

  if (decision.kind === "late_payment") {
    // キャンセル後に支払われた。取引は復活させず、返金対象として見えるようにする
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("transactions")
      .update({
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: paymentIntentId,
        stripe_session_id: session.id,
      })
      .eq("id", transaction!.id)
      .eq("status", "canceled");
    if (error) throw new Error(`遅延入金の記録に失敗しました: ${error.message}`);

    await recordEvent(
      transaction!.id,
      "payment_after_cancel",
      null,
      "キャンセル後に支払いが完了しました。返金対応が必要です",
    );
    await notifyLatePayment(transaction!.id);
    // 購入者にも必ず知らせる。運営あてだけだと、代金を払った本人が
    // 何が起きたのか・返金されるのかを知る手段が無い(監査 C-2)
    await notifyPaidAfterCancel(transaction!.id);
    return { handled: true, action: "late_payment_recorded" };
  }

  // 金額・通貨の食い違いは黙って通さない(改ざん経路は無いが、設定ミスの検知のため)
  if (
    session.amount_total !== undefined &&
    !amountMatches(transaction!.price, session.amount_total, session.currency)
  ) {
    console.error("[stripe webhook] 金額または通貨が取引と一致しません", {
      transactionId: transaction!.id,
      expected: transaction!.price,
      amountTotal: session.amount_total,
      currency: session.currency,
    });
  }

  await transitionTransaction(transaction!, "paid", "system", {
    patch: {
      stripe_payment_intent_id: paymentIntentId,
      stripe_session_id: session.id,
    },
  });

  await notifyPaid(transaction!.id);
  return { handled: true, action: "paid" };
}

/**
 * checkout.session.expired / checkout.session.async_payment_failed の処理。
 * 未決済のままの取引をキャンセルし、商品を購入可能に戻す。
 *
 * Stripe から届く時点でセッションは閉じているので、ここでは失効処理を行わず
 * 直接キャンセルする。
 */
export async function handleCheckoutExpired(
  session: Pick<Stripe.Checkout.Session, "id" | "metadata">,
  reason: "payment_expired" | "payment_failed" | "canceled_by_buyer" = "payment_expired",
): Promise<WebhookOutcome> {
  const transactionId = session.metadata?.transaction_id;
  const transaction = transactionId ? await getTransaction(transactionId) : null;
  const decision = decideExpired(transactionId, transaction?.status ?? null);

  if (decision.kind === "invalid") {
    return { handled: false, reason: decision.reason, retry: decision.retry };
  }
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
 * charge.dispute.created の処理。
 *
 * 反論資料の提出は Stripe ダッシュボードで行う(返金・送金 API は別紙1 3.(4) により対象外)。
 * ここでは運営が気づけるよう通知するのみで、取引の状態は変更しない
 * — 申し立てが認められるとは限らず、この時点で取引をキャンセルすると
 * 正当な取引まで巻き添えになるため。
 */
export async function handleDisputeCreated(
  dispute: Pick<Stripe.Dispute, "id" | "amount" | "reason" | "payment_intent" | "evidence_details">,
): Promise<WebhookOutcome> {
  // 管理画面で見えるよう取引に記録する(状態は変えない)
  const paymentIntentId = paymentIntentIdOf(dispute.payment_intent);
  if (paymentIntentId) {
    await createAdminClient()
      .from("transactions")
      .update({ disputed_at: new Date().toISOString(), dispute_id: dispute.id })
      .eq("stripe_payment_intent_id", paymentIntentId);
  }

  await notifyDispute({
    disputeId: dispute.id,
    paymentIntentId: paymentIntentIdOf(dispute.payment_intent),
    amount: dispute.amount,
    reason: dispute.reason ?? null,
    evidenceDueBy: dispute.evidence_details?.due_by ?? null,
  });

  return { handled: true, action: "dispute_notified" };
}

/**
 * charge.refunded の処理(C-3)。
 *
 * 返金そのものは運営が Stripe ダッシュボードで行う(別紙1 3.(4))。
 * ここではその事実を受け取り、管理画面の「要返金」から外す。
 */
export async function handleChargeRefunded(
  charge: Pick<Stripe.Charge, "id" | "payment_intent" | "refunded" | "amount_refunded">,
): Promise<WebhookOutcome> {
  const paymentIntentId = paymentIntentIdOf(charge.payment_intent);
  if (!paymentIntentId) {
    return { handled: false, reason: "payment_intent がありません", retry: false };
  }
  if (!charge.refunded && !charge.amount_refunded) {
    return { handled: true, action: "already_processed" };
  }

  const supabase = createAdminClient();
  const { data: target, error: fetchError } = await supabase
    .from("transactions")
    .select("id, status, refunded_at")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (fetchError) throw new Error(`返金対象の取得に失敗しました: ${fetchError.message}`);
  if (!target) {
    return { handled: false, reason: "該当する取引がありません", retry: false };
  }
  if (target.refunded_at) {
    return { handled: true, action: "already_processed" };
  }

  // 部分返金は「返金済み」と同じ扱いにできない。全額かどうかで分ける
  const fullyRefunded = charge.refunded === true;

  // 進行中の取引に返金が来たら、勝手にキャンセルはしない。
  // 実物がもう発送されている可能性があり、判断は運営に委ねる必要がある。
  // ここで refunded_at を立てると「要返金」一覧からも消えて誰も気づけなくなる。
  if (target.status !== "canceled") {
    await recordEvent(
      target.id,
      "refunded_while_active",
      null,
      `進行中(${target.status})の取引に返金が届きました。返金額 ${charge.amount_refunded} 円`,
    );
    await notifyRefundedWhileActive(target.id);
    return { handled: true, action: "refund_needs_review" };
  }

  if (!fullyRefunded) {
    await recordEvent(
      target.id,
      "partially_refunded",
      null,
      `一部返金 ${charge.amount_refunded} 円を受け取りました`,
    );
    return { handled: true, action: "partial_refund_recorded" };
  }

  const { error } = await supabase
    .from("transactions")
    .update({ refunded_at: new Date().toISOString() })
    .eq("id", target.id)
    .is("refunded_at", null);
  if (error) throw new Error(`返金の記録に失敗しました: ${error.message}`);

  return { handled: true, action: "refund_recorded" };
}

/**
 * 未決済のまま放置された取引を掃除する(Webhook 取りこぼしの保険)。
 *
 * 現在の決済手段はカードのみで、Checkout の期限は
 * `CHECKOUT_EXPIRES_MINUTES` 分。掃除はその後に効くよう設定している。
 * キャンセルの前に Stripe 側のセッションを必ず確認する(A-1)。
 * その時点で支払い済みと分かった取引は paid に遷移させる。
 *
 * 注意: コンビニ払い・銀行振込を追加する場合、入金までに数日かかるため
 * この掃除がまだ支払われていない取引を先に潰してしまう。後払い手段を有効にする際は
 * `pending_payment` のうち「後払い待ち」を区別できるようにしてから閾値を見直すこと。
 *
 * @returns キャンセルした件数
 */
export async function cleanupStalePendingTransactions(
  olderThanMinutes = STALE_PAYMENT_CLEANUP_MINUTES,
  limit = BATCH_LIMIT_PER_RUN,
): Promise<number> {
  const supabase = createAdminClient();
  const threshold = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("transactions")
    .select("id")
    .eq("status", "pending_payment")
    .lt("created_at", threshold)
    // 古いものから順に、1 回あたりの上限まで(残りは次回。冪等なので問題ない)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!data || data.length === 0) return 0;

  let canceled = 0;
  const failed: string[] = [];
  for (const row of data) {
    try {
      const transaction = await getTransaction(row.id);
      if (!transaction || transaction.status !== "pending_payment") continue;

      const result = await cancelPendingTransaction(transaction, "system", {
        reason: "payment_timeout",
        note: "未決済のまま期限を超過",
      });
      if (result.outcome === "canceled") canceled += 1;
    } catch (error) {
      failed.push(row.id);
      console.error("[cleanup failed]", row.id, error);
    }
  }

  // 同じ取引が毎日ここで失敗し続けると、その商品は誰も買えないまま固まる。
  // 件数をまとめて出し、ログを見れば気づけるようにする(監査 C-1)
  if (failed.length > 0) {
    console.error(
      `[cleanup] ${failed.length}/${data.length} 件の未決済取引を片付けられませんでした。` +
        `該当商品は購入できないままです。管理画面から強制キャンセルしてください: ${failed.join(", ")}`,
    );
  }

  return canceled;
}
