import { describe, expect, it } from "vitest";
import {
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

describe("assertProductionEnv", () => {
  it("本番以外では検証しない", () => {
    expect(() => assertProductionEnv({ VERCEL_ENV: "preview" })).not.toThrow();
  });

  it("本番で不備があれば起動を止める", () => {
    expect(() => assertProductionEnv({ ...complete, CRON_SECRET: "" })).toThrow(/CRON_SECRET/);
  });
});
