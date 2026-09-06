import { describe, expect, it, afterEach } from "vitest";
import { getPlatformFeeRate } from "@/features/listing/fee";
import { calcFee } from "@/features/listing/rules";

/**
 * 手数料は出品画面に「受け取り目安」として出る数字。
 * 設定を間違えたときに、負の金額や 0 円が出ないようにする。
 */
describe("販売手数料", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("設定が無ければ既定の7%", () => {
    delete process.env.PLATFORM_FEE_RATE;
    expect(getPlatformFeeRate()).toBe(0.07);
  });

  it("設定された率を使う", () => {
    process.env.PLATFORM_FEE_RATE = "0.1";
    expect(getPlatformFeeRate()).toBe(0.1);
    process.env.PLATFORM_FEE_RATE = "0";
    expect(getPlatformFeeRate()).toBe(0);
  });

  it("ありえない値は既定に戻す", () => {
    for (const bad of ["-0.1", "1", "1.5", "abc"]) {
      process.env.PLATFORM_FEE_RATE = bad;
      expect(getPlatformFeeRate(), bad).toBe(0.07);
    }
  });

  it("空のまま登録されていても 0% にならない", () => {
    // Number("") は 0 になる。空の環境変数はよくあるので、未設定として扱う
    for (const blank of ["", " ", "\n"]) {
      process.env.PLATFORM_FEE_RATE = blank;
      expect(getPlatformFeeRate(), JSON.stringify(blank)).toBe(0.07);
    }
  });

  it("端数は切り捨て、受取額と合計が合う", () => {
    const { fee, payout } = calcFee(12345, 0.07);
    expect(fee).toBe(864);
    expect(payout).toBe(12345 - 864);
    expect(fee + payout).toBe(12345);
  });

  it("価格が不正なときは 0 円として扱う", () => {
    expect(calcFee(0, 0.07)).toEqual({ fee: 0, payout: 0 });
    expect(calcFee(-100, 0.07)).toEqual({ fee: 0, payout: 0 });
    expect(calcFee(Number.NaN, 0.07)).toEqual({ fee: 0, payout: 0 });
  });
});
