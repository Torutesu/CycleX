import { describe, expect, it } from "vitest";
import { canWithdraw, resolvePostLoginPath } from "@/features/auth/rules";

describe("canWithdraw", () => {
  it("進行中の取引が無ければ退会できる", () => {
    expect(canWithdraw(0)).toBe(true);
  });

  it("進行中の取引が1件でもあれば退会できない", () => {
    expect(canWithdraw(1)).toBe(false);
    expect(canWithdraw(5)).toBe(false);
  });
});

describe("resolvePostLoginPath", () => {
  it("通常アカウントは next へ遷移する", () => {
    expect(resolvePostLoginPath("active", "/mypage")).toEqual({
      path: "/mypage",
      signOut: false,
    });
  });

  it("利用停止アカウントは案内ページへ送る", () => {
    expect(resolvePostLoginPath("suspended", "/mypage")).toEqual({
      path: "/suspended",
      signOut: false,
    });
  });

  it("退会済みアカウントはサインアウトさせエラーを返す", () => {
    const result = resolvePostLoginPath("withdrawn", "/mypage");
    expect(result.signOut).toBe(true);
    expect(result.error).toContain("退会済み");
  });
});
