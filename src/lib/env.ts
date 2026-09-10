/**
 * 実行環境の判定と、本番で欠けてはいけない設定の検証。
 *
 * Vercel は本番・Preview・開発で環境変数を別々に持つ。Preview の値を本番へ
 * コピーしたり、本番で 1 つ入れ忘れたりしても、起動時に気づけるようにする。
 * `server-only` は付けない(next.config.ts と instrumentation.ts からも使う)。
 */

/** process.env 相当。テストで差し替えやすいよう緩い型にしている */
export type EnvLike = Record<string, string | undefined>;

/** 本番の実ユーザーが触る環境か(Vercel の Production デプロイ) */
export function isProductionRuntime(env: EnvLike = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

/**
 * 決済を無効にして公開するか(`CYCLEX_PAYMENTS_DISABLED=1`)。
 *
 * Stripe のキー発行を待たずに、閲覧・出品・メッセージ・管理までを
 * 関係者に見せたい段階がある。そのとき Stripe のキーを必須のままにすると
 * 起動時に落ちるし、適当な値を入れると「購入手続きへ」まで進めたうえで
 * Checkout の作成に失敗する。どちらも良くない。
 *
 * このフラグを立てると Stripe のキーを必須から外し、購入の導線を
 * 「準備中」として閉じる。決済を通さずに取引が成立することはない
 * (デモ決済は本番では無効。`src/lib/demo.ts` 参照)。
 */
export function arePaymentsDisabled(env: EnvLike = process.env): boolean {
  return env.CYCLEX_PAYMENTS_DISABLED === "1";
}

/** 決済に関わる環境変数。`CYCLEX_PAYMENTS_DISABLED=1` のときは必須から外す */
export const PAYMENT_ENV_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const;

/** 本番で必須の環境変数。値が空でも欠落とみなす */
export const REQUIRED_IN_PRODUCTION = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "CRON_SECRET",
] as const;

/** ローカル用のダミー値。本番に残っていたら設定漏れとして扱う */
const PLACEHOLDER_VALUES: Partial<Record<(typeof REQUIRED_IN_PRODUCTION)[number], RegExp>> = {
  STRIPE_SECRET_KEY: /^sk_test_(xxx|dummy)$/,
  STRIPE_WEBHOOK_SECRET: /^whsec_(xxx|dummy)$/,
  RESEND_API_KEY: /^re_(xxx|dummy)$/,
  EMAIL_FROM: /example\.com/,
  NEXT_PUBLIC_APP_URL: /localhost|127\.0\.0\.1/,
};

/** 本番設定の不備を列挙する(純関数)。空配列なら問題なし */
export function findProductionEnvProblems(env: EnvLike = process.env): string[] {
  const problems: string[] = [];
  const paymentsDisabled = arePaymentsDisabled(env);

  for (const key of REQUIRED_IN_PRODUCTION) {
    // 決済を無効にして公開する段階では Stripe のキーを求めない
    if (paymentsDisabled && (PAYMENT_ENV_KEYS as readonly string[]).includes(key)) continue;
    const value = env[key];
    if (!value || value.trim() === "") {
      problems.push(`${key} が設定されていません`);
      continue;
    }
    const placeholder = PLACEHOLDER_VALUES[key];
    if (placeholder && placeholder.test(value)) {
      problems.push(`${key} にローカル用のダミー値が入っています`);
    }
  }

  if (env.ALLOW_DEMO_CHECKOUT === "1") {
    problems.push("ALLOW_DEMO_CHECKOUT が有効です(本番では設定しない)");
  }

  return problems;
}

/**
 * 本番なら設定を検証し、不備があれば起動を止める。
 * それ以外の環境では何もしない。
 */
export function assertProductionEnv(env: EnvLike = process.env): void {
  if (!isProductionRuntime(env)) return;
  const problems = findProductionEnvProblems(env);
  if (problems.length > 0) {
    throw new Error(`本番の環境変数に不備があります:\n- ${problems.join("\n- ")}`);
  }
  if (arePaymentsDisabled(env)) {
    // 意図した状態でも、気づかないまま公開し続けないようログに残す
    console.warn(
      "[production env] CYCLEX_PAYMENTS_DISABLED=1 のため決済を無効にして起動しました。購入の導線は「準備中」として閉じています。",
    );
  }
}
