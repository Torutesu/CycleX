import "server-only";

import Stripe from "stripe";

let client: Stripe | null = null;

/**
 * Stripe クライアント(FR-09)。
 * 使用するのは Checkout と Webhook のみで、Connect・返金 API・送金は使わない
 * (別紙1 3.(4) によりエスクロー・資金移動は対象外)。
 */
export function getStripe(): Stripe {
  if (client) return client;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY が設定されていません");
  }

  client = new Stripe(secretKey, { typescript: true });
  return client;
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET が設定されていません");
  }
  return secret;
}

export type ExpireSessionResult =
  /** 失効させた(または元々開いていなかった)。以後この画面から支払われることはない */
  | { status: "expired" }
  /** すでに支払いが完了していた。取引を paid にする必要がある */
  | { status: "already_paid"; paymentIntentId: string | null }
  /** Stripe に問い合わせできなかった。安全側に倒して取引を残す */
  | { status: "error"; error: unknown };

/**
 * Checkout Session を失効させる。
 *
 * DB 側で取引をキャンセルしても、Stripe の決済画面は有効期限まで生きている。
 * 購入者がその画面から支払うと「キャンセル済みなのに入金だけある」状態になるため、
 * pending の取引をキャンセルする経路は必ず先にこれを呼ぶ。
 *
 * デモ決済の擬似セッション(`demo_` 始まり)は Stripe に存在しないので何もしない。
 */
export async function expireCheckoutSession(sessionId: string): Promise<ExpireSessionResult> {
  if (sessionId.startsWith("demo_")) return { status: "expired" };

  const stripe = getStripe();
  try {
    await stripe.checkout.sessions.expire(sessionId);
    return { status: "expired" };
  } catch (error) {
    // 「open でないので失効できない」= 期限切れか支払い済み。実際の状態を確かめる
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === "paid") {
        const intent = session.payment_intent;
        return {
          status: "already_paid",
          paymentIntentId: typeof intent === "string" ? intent : (intent?.id ?? null),
        };
      }
      return { status: "expired" };
    } catch (retrieveError) {
      console.error("[stripe] セッションの失効・照会に失敗しました", sessionId, retrieveError);
      return { status: "error", error };
    }
  }
}
