import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../../next.config";

afterEach(() => vi.unstubAllEnvs());

describe("公開準備中の検索除外", () => {
  it("有効時は全パスに noindex を付け、既存のセキュリティヘッダーも維持する", async () => {
    vi.stubEnv("NEXT_PUBLIC_NOINDEX", "1");
    const rules = await config.headers!();
    const allPaths = rules.find((rule) => rule.source === "/:path*");
    expect(allPaths?.headers).toContainEqual({
      key: "X-Robots-Tag",
      value: "noindex, nofollow",
    });
    expect(allPaths?.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
  });

  it.each([undefined, "0", ""])("公開時（設定値 %s）は検索除外を解除できる", async (value) => {
    vi.stubEnv("NEXT_PUBLIC_NOINDEX", value);
    const rules = await config.headers!();
    expect(
      rules.flatMap((rule) => rule.headers).some((header) => header.key === "X-Robots-Tag"),
    ).toBe(false);
  });
});
