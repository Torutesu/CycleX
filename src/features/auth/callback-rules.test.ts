import { describe, expect, it } from "vitest";
import { decideAuthCallback } from "@/features/auth/callback-rules";

const decide = (query: string) => decideAuthCallback(new URLSearchParams(query));

describe("decideAuthCallback", () => {
  it("PKCE の code を受け取る", () => {
    expect(decide("code=abc123&next=%2Fmypage")).toEqual({
      kind: "code",
      code: "abc123",
      next: "/mypage",
    });
  });

  it("token_hash 形式のメールリンクを受け取る", () => {
    expect(decide("token_hash=hash123&type=signup")).toEqual({
      kind: "otp",
      tokenHash: "hash123",
      type: "signup",
      next: "/mypage",
    });
  });

  it("パスワードリセットは next が無くても更新画面へ送る", () => {
    expect(decide("token_hash=hash123&type=recovery")).toMatchObject({
      kind: "otp",
      next: "/reset-password/update",
    });
  });

  it("メールアドレス変更は設定画面へ送る", () => {
    expect(decide("token_hash=hash123&type=email_change")).toMatchObject({
      kind: "otp",
      next: "/mypage/settings",
    });
  });

  it("next が明示されていればそちらを優先する", () => {
    expect(decide("token_hash=h&type=recovery&next=%2Fmypage")).toMatchObject({
      next: "/mypage",
    });
  });

  it("外部への next は既定値へ落とす(オープンリダイレクト対策)", () => {
    expect(decide("code=abc&next=https%3A%2F%2Fevil.example.com")).toMatchObject({
      next: "/mypage",
    });
    expect(decide("code=abc&next=%2F%2Fevil.example.com")).toMatchObject({ next: "/mypage" });
  });

  it("期限切れは expired として区別する", () => {
    expect(decide("error=access_denied&error_code=otp_expired")).toEqual({
      kind: "error",
      reason: "expired",
    });
    expect(decide("error=access_denied")).toEqual({ kind: "error", reason: "expired" });
  });

  it("退会・停止済みアカウント(user_banned)は期限切れと区別する", () => {
    expect(decide("error=access_denied&error_code=user_banned")).toEqual({
      kind: "error",
      reason: "banned",
    });
  });

  it("そのほかの Supabase エラーは callback として扱う", () => {
    expect(decide("error=server_error")).toEqual({ kind: "error", reason: "callback" });
  });

  it("code も token_hash も無ければエラー", () => {
    expect(decide("")).toEqual({ kind: "error", reason: "callback" });
    expect(decide("next=%2Fmypage")).toEqual({ kind: "error", reason: "callback" });
  });

  it("知らない type は受け付けない", () => {
    expect(decide("token_hash=h&type=unknown")).toEqual({ kind: "error", reason: "callback" });
  });
});
