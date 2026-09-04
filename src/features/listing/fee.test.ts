import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getPlatformFeeRate } from "@/features/listing/fee";

const original = process.env.PLATFORM_FEE_RATE;

afterEach(() => {
  if (original === undefined) delete process.env.PLATFORM_FEE_RATE;
  else process.env.PLATFORM_FEE_RATE = original;
});

describe("getPlatformFeeRate", () => {
  it("環境変数の率を使う", () => {
    process.env.PLATFORM_FEE_RATE = "0.1";
    expect(getPlatformFeeRate()).toBe(0.1);
  });

  it("未設定・不正値は既定の 7% に落とす", () => {
    delete process.env.PLATFORM_FEE_RATE;
    expect(getPlatformFeeRate()).toBe(0.07);
    process.env.PLATFORM_FEE_RATE = "abc";
    expect(getPlatformFeeRate()).toBe(0.07);
    process.env.PLATFORM_FEE_RATE = "1.5";
    expect(getPlatformFeeRate()).toBe(0.07);
  });
});
