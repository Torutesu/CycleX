import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { demoSessionId, isDemoCheckout } from "@/lib/demo";

describe("isDemoCheckout", () => {
  it("明示的に有効化され、Stripe が未構成のときだけ有効", () => {
    expect(isDemoCheckout({ ALLOW_DEMO_CHECKOUT: "1" })).toBe(true);
    expect(isDemoCheckout({ ALLOW_DEMO_CHECKOUT: "1", STRIPE_SECRET_KEY: "sk_test_x" })).toBe(
      false,
    );
    expect(isDemoCheckout({})).toBe(false);
    expect(isDemoCheckout({ ALLOW_DEMO_CHECKOUT: "true" })).toBe(false);
  });

  it("本番デプロイでは条件が揃っていても無効", () => {
    expect(isDemoCheckout({ ALLOW_DEMO_CHECKOUT: "1", VERCEL_ENV: "production" })).toBe(false);
    expect(isDemoCheckout({ ALLOW_DEMO_CHECKOUT: "1", VERCEL_ENV: "preview" })).toBe(true);
  });
});

describe("demoSessionId", () => {
  it("Stripe のセッション ID と区別できる接頭辞を付ける", () => {
    expect(demoSessionId("tx-1")).toBe("demo_tx-1");
  });
});
