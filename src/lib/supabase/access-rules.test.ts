import { describe, expect, it } from "vitest";
import { decideAccess, isAdminPath, isProtectedPath } from "@/lib/supabase/access-rules";

describe("isProtectedPath / isAdminPath", () => {
  it("会員向けパスは前方一致で判定する", () => {
    expect(isProtectedPath("/mypage")).toBe(true);
    expect(isProtectedPath("/mypage/listings")).toBe(true);
    expect(isProtectedPath("/mypagex")).toBe(false);
    expect(isProtectedPath("/items/abc")).toBe(false);
  });

  it("管理パス", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/users/1")).toBe(true);
    expect(isAdminPath("/administrator")).toBe(false);
  });
});

describe("decideAccess", () => {
  it("未ログインは公開ページのみ", () => {
    expect(decideAccess("/", false, null, null)).toEqual({ kind: "allow" });
    expect(decideAccess("/items/1", false, null, null)).toEqual({ kind: "allow" });
    expect(decideAccess("/mypage", false, null, null)).toEqual({ kind: "login" });
    expect(decideAccess("/admin", false, null, null)).toEqual({ kind: "login" });
  });

  it("通常の会員は会員ページに入れ、管理画面は 404", () => {
    expect(decideAccess("/mypage", true, "active", "user")).toEqual({ kind: "allow" });
    expect(decideAccess("/admin", true, "active", "user")).toEqual({ kind: "not_found" });
    expect(decideAccess("/admin/users", true, "active", "admin")).toEqual({ kind: "allow" });
  });

  it("停止中は公開ページを含めて停止画面へ送る", () => {
    for (const path of ["/", "/search", "/items/1", "/users/2", "/mypage", "/admin"]) {
      expect(decideAccess(path, true, "suspended", "user")).toEqual({ kind: "suspended" });
    }
  });

  it("停止中でも停止画面・認証・API には到達できる", () => {
    for (const path of ["/suspended", "/auth/callback", "/api/webhooks/stripe", "/login"]) {
      expect(decideAccess(path, true, "suspended", "user")).toEqual({ kind: "allow" });
    }
  });

  it("退会済みも停止中と同じ扱い", () => {
    expect(decideAccess("/", true, "withdrawn", "user")).toEqual({ kind: "suspended" });
  });

  it("状態が JWT に無い(通常の利用者)は allow", () => {
    expect(decideAccess("/search", true, null, null)).toEqual({ kind: "allow" });
  });
});
