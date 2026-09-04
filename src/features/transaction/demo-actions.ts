"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/session";
import { isDemoCheckout, demoSessionId } from "@/lib/demo";
import { fail, toUserMessage, AppError, type ActionResult } from "@/lib/errors";
import { getTransaction } from "@/features/transaction/service";
import { handleCheckoutCompleted, handleCheckoutExpired } from "@/features/transaction/webhook";

/**
 * デモ決済の確定・取消(Stripe 未設定時のみ)。
 *
 * 本物の Webhook と同じ関数を呼ぶ。状態遷移・通知・冪等性の担保は
 * すべて既存の処理に委ねるので、デモ専用の抜け道は作らない。
 */

/** 呼び出し元がその取引の購入者であることを確かめる */
async function requireBuyerOfPending(transactionId: string) {
  if (!isDemoCheckout()) {
    throw new AppError("この操作は利用できません。");
  }

  const user = await requireVerifiedUser();
  const transaction = await getTransaction(transactionId);

  if (!transaction) throw new AppError("取引が見つかりません。");
  if (transaction.buyerId !== user.id) throw new AppError("この取引は操作できません。");
  if (transaction.status !== "pending_payment") {
    throw new AppError("この取引はすでに手続きが済んでいます。");
  }

  return transaction;
}

export async function completeDemoPayment(transactionId: string): Promise<ActionResult<undefined>> {
  try {
    const transaction = await requireBuyerOfPending(transactionId);

    // 本物の checkout.session.completed と同じ形にして同じ処理へ渡す
    const outcome = await handleCheckoutCompleted({
      id: demoSessionId(transactionId),
      metadata: { transaction_id: transactionId },
      payment_intent: `pi_demo_${transactionId}`,
      payment_status: "paid",
      amount_total: transaction.price,
      currency: "jpy",
    });

    if (!outcome.handled) {
      console.error("[demo checkout] 処理できませんでした:", outcome.reason);
      throw new AppError("デモ決済を完了できませんでした。");
    }
  } catch (error) {
    return fail(toUserMessage(error));
  }

  revalidatePath("/mypage/purchases");
  redirect(`/purchase/complete?tx=${transactionId}`);
}

export async function cancelDemoPayment(transactionId: string): Promise<ActionResult<undefined>> {
  let listingId: string;

  try {
    const transaction = await requireBuyerOfPending(transactionId);
    listingId = transaction.listingId;

    await handleCheckoutExpired(
      { id: demoSessionId(transactionId), metadata: { transaction_id: transactionId } },
      "payment_expired",
    );
  } catch (error) {
    return fail(toUserMessage(error));
  }

  redirect(`/items/${listingId}?canceled=1`);
}
