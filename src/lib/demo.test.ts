import { describe, expect, it, afterEach } from "vitest";
import { demoSessionId, isDemoCheckout } from "@/lib/demo";

/**
 * デモ決済は「Stripe を構成していない環境でだけ」動いてよい。
 * 本番の鍵が入ったまま有効になると、支払わずに取引が進んでしまう。
 */
describe("デモ決済の入り切り", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("明示的に許可し、かつ Stripe の鍵が無いときだけ有効", () => {
    process.env.ALLOW_DEMO_CHECKOUT = "1";
    delete process.env.STRIPE_SECRET_KEY;
    expect(isDemoCheckout()).toBe(true);
  });

  it("Stripe の鍵があれば、許可していても無効", () => {
    process.env.ALLOW_DEMO_CHECKOUT = "1";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    expect(isDemoCheckout()).toBe(false);
  });

  it("Stripe の鍵が空のまま登録されていても、判定が揺れない", () => {
    process.env.ALLOW_DEMO_CHECKOUT = "1";
    process.env.STRIPE_SECRET_KEY = "   ";
    // 空白だけの鍵は「未設定」。中途半端に本番決済へ進もうとしない
    expect(isDemoCheckout()).toBe(true);
  });

  it("既定では無効", () => {
    delete process.env.ALLOW_DEMO_CHECKOUT;
    delete process.env.STRIPE_SECRET_KEY;
    expect(isDemoCheckout()).toBe(false);

    process.env.ALLOW_DEMO_CHECKOUT = "true";
    expect(isDemoCheckout(), "1 以外の値では有効にしない").toBe(false);
  });

  it("デモの取引 ID は本物と見分けが付く", () => {
    expect(demoSessionId("abc-123")).toBe("demo_abc-123");
  });
});
