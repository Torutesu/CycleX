import "server-only";

import { isProductionRuntime, type EnvLike } from "@/lib/env";

/**
 * デモ決済モード。
 *
 * Stripe の審査やキーの発行が済む前でも、購入から取引完了・評価までを
 * 通しで確認できるようにするための逃げ道。
 * 状態遷移そのものは本番と同じ Webhook 処理を通すので、
 * 「デモでは動くが本番では動かない」経路を新たに作らない。
 *
 * 有効になる条件を3つ重ねている。
 * - `ALLOW_DEMO_CHECKOUT=1` が明示的に設定されている
 * - `STRIPE_SECRET_KEY` が未設定(=本物の決済が構成されていない)
 * - Vercel の本番デプロイではない
 *
 * Preview の環境変数を本番へコピーしても、本番でキーを入れ忘れても、
 * 実ユーザーが無料で「支払い済み」を作れる状態にはならない。
 */
export function isDemoCheckout(env: EnvLike = process.env): boolean {
  if (isProductionRuntime(env)) return false;
  return env.ALLOW_DEMO_CHECKOUT === "1" && !env.STRIPE_SECRET_KEY;
}

/** デモ決済で使う擬似セッション ID */
export function demoSessionId(transactionId: string): string {
  return `demo_${transactionId}`;
}
