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
