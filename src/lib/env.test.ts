import { describe, expect, it, afterEach } from "vitest";
import { envValue, requireEnv } from "@/lib/env";

/**
 * 「空のまま登録されている環境変数」で壊れないことを固定する。
 * 実際に Vercel で NEXT_PUBLIC_APP_URL が空登録され、ビルドが落ちたことがある。
 */
describe("環境変数の読み取り", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("設定された値をそのまま返す", () => {
    process.env.SAMPLE_VALUE = "abc";
    expect(envValue("SAMPLE_VALUE")).toBe("abc");
  });

  it("前後の空白は落とす", () => {
    process.env.SAMPLE_VALUE = "  abc  ";
    expect(envValue("SAMPLE_VALUE")).toBe("abc");
  });

  it("未設定・空・空白だけは、いずれも未設定として扱う", () => {
    delete process.env.SAMPLE_VALUE;
    expect(envValue("SAMPLE_VALUE")).toBeUndefined();
    for (const blank of ["", " ", "\t", "\n  "]) {
      process.env.SAMPLE_VALUE = blank;
      expect(envValue("SAMPLE_VALUE"), JSON.stringify(blank)).toBeUndefined();
    }
  });

  it("必須のものは、空なら名前付きで落ちる", () => {
    process.env.SAMPLE_VALUE = "";
    expect(() => requireEnv("SAMPLE_VALUE")).toThrow(/SAMPLE_VALUE/);
    process.env.SAMPLE_VALUE = "ok";
    expect(requireEnv("SAMPLE_VALUE")).toBe("ok");
  });
});
