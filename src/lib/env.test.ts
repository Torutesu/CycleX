import { describe, expect, it } from "vitest";
import {
  arePaymentsDisabled,
  assertProductionEnv,
  findProductionEnvProblems,
  isProductionRuntime,
  type EnvLike,
} from "@/lib/env";

const complete: EnvLike = {
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://cyclex.example.jp",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  STRIPE_SECRET_KEY: "sk_live_abc",
  STRIPE_WEBHOOK_SECRET: "whsec_abc",
  RESEND_API_KEY: "re_abc",
  EMAIL_FROM: "CycleX <noreply@cyclex.example.jp>",
  CRON_SECRET: "secret",
};

describe("isProductionRuntime", () => {
  it("Vercel の Production デプロイのみ本番とみなす", () => {
    expect(isProductionRuntime({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionRuntime({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionRuntime({ NODE_ENV: "production" })).toBe(false);
    expect(isProductionRuntime({})).toBe(false);
  });
});

describe("findProductionEnvProblems", () => {
  it("すべて揃っていれば問題なし", () => {
    expect(findProductionEnvProblems(complete)).toEqual([]);
  });

  it("欠落とダミー値を検出する", () => {
    const problems = findProductionEnvProblems({
      ...complete,
      STRIPE_SECRET_KEY: "sk_test_xxx",
      RESEND_API_KEY: "",
      EMAIL_FROM: "CycleX <noreply@example.com>",
    });
    expect(problems).toEqual([
      "STRIPE_SECRET_KEY にローカル用のダミー値が入っています",
      "RESEND_API_KEY が設定されていません",
      "EMAIL_FROM にローカル用のダミー値が入っています",
    ]);
  });

  it("デモ決済が有効なら本番設定の不備として扱う", () => {
    expect(findProductionEnvProblems({ ...complete, ALLOW_DEMO_CHECKOUT: "1" })).toEqual([
      "ALLOW_DEMO_CHECKOUT が有効です(本番では設定しない)",
    ]);
  });
});

describe("arePaymentsDisabled", () => {
  it("明示的に 1 のときだけ無効にする", () => {
    expect(arePaymentsDisabled({ CYCLEX_PAYMENTS_DISABLED: "1" })).toBe(true);
    expect(arePaymentsDisabled({ CYCLEX_PAYMENTS_DISABLED: "0" })).toBe(false);
    expect(arePaymentsDisabled({ CYCLEX_PAYMENTS_DISABLED: "true" })).toBe(false);
    expect(arePaymentsDisabled({})).toBe(false);
  });
});

describe("決済を無効にして公開する場合", () => {
  it("Stripe のキーだけを必須から外す", () => {
    const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ...withoutStripe } = complete;
    void STRIPE_SECRET_KEY;
    void STRIPE_WEBHOOK_SECRET;

    // フラグ無しでは欠落として検出する
    expect(findProductionEnvProblems(withoutStripe)).toEqual([
      "STRIPE_SECRET_KEY が設定されていません",
      "STRIPE_WEBHOOK_SECRET が設定されていません",
    ]);

    // フラグを立てれば起動できる
    expect(findProductionEnvProblems({ ...withoutStripe, CYCLEX_PAYMENTS_DISABLED: "1" })).toEqual(
      [],
    );
  });

  it("Stripe 以外の欠落は見逃さない", () => {
    const { RESEND_API_KEY, ...withoutResend } = complete;
    void RESEND_API_KEY;
    expect(findProductionEnvProblems({ ...withoutResend, CYCLEX_PAYMENTS_DISABLED: "1" })).toEqual([
      "RESEND_API_KEY が設定されていません",
    ]);
  });

  it("デモ決済の抜け道は塞いだまま", () => {
    // 決済を無効にしても、無料で「支払い済み」を作れる状態は許さない
    expect(
      findProductionEnvProblems({
        ...complete,
        CYCLEX_PAYMENTS_DISABLED: "1",
        ALLOW_DEMO_CHECKOUT: "1",
      }),
    ).toContain("ALLOW_DEMO_CHECKOUT が有効です(本番では設定しない)");
  });
});

describe("assertProductionEnv", () => {
  it("本番以外では検証しない", () => {
    expect(() => assertProductionEnv({ VERCEL_ENV: "preview" })).not.toThrow();
  });

  it("本番で不備があれば起動を止める", () => {
    expect(() => assertProductionEnv({ ...complete, CRON_SECRET: "" })).toThrow(/CRON_SECRET/);
  });
});
