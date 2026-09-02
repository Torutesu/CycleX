import "server-only";

/**
 * デモ決済モード。
 *
 * Stripe の審査やキーの発行が済む前でも、購入から取引完了・評価までを
 * 通しで確認できるようにするための逃げ道。
 * 状態遷移そのものは本番と同じ Webhook 処理を通すので、
 * 「デモでは動くが本番では動かない」経路を新たに作らない。
 *
 * 有効になる条件を2つ重ねている。
 * - `ALLOW_DEMO_CHECKOUT=1` が明示的に設定されている
 * - `STRIPE_SECRET_KEY` が未設定(=本物の決済が構成されていない)
 *
 * 後者があるため、Stripe のキーを入れた時点でデモは自動的に無効になる。
 * 本物の決済が使える環境でデモ決済が動くことはない。
 */
export function isDemoCheckout(): boolean {
  return process.env.ALLOW_DEMO_CHECKOUT === "1" && !process.env.STRIPE_SECRET_KEY;
}

/** デモ決済で使う擬似セッション ID */
export function demoSessionId(transactionId: string): string {
  return `demo_${transactionId}`;
}
