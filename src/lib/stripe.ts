import "server-only";

import Stripe from "stripe";
import { requireEnv } from "@/lib/env";

let client: Stripe | null = null;

/**
 * Stripe クライアント(FR-09)。
 * 使用するのは Checkout と Webhook のみで、Connect・返金 API・送金は使わない
 * (別紙1 3.(4) によりエスクロー・資金移動は対象外)。
 */
export function getStripe(): Stripe {
  if (client) return client;

  client = new Stripe(requireEnv("STRIPE_SECRET_KEY"), { typescript: true });
  return client;
}

export function getWebhookSecret(): string {
  return requireEnv("STRIPE_WEBHOOK_SECRET");
}

/**
 * Webhook の署名を検証してイベントを取り出す。
 *
 * 検証は署名鍵だけで完結し、API 鍵は要らない。
 * getStripe() 経由にすると STRIPE_SECRET_KEY が未設定なだけで全イベントが
 * 400 になり、Stripe 側でエンドポイントを止められてしまうため、
 * クライアントを作らずに済む静的な入口を使う。
 */
export function verifyStripeEvent(rawBody: string, signature: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(rawBody, signature, getWebhookSecret());
}
