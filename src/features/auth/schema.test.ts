import { describe, expect, it } from "vitest";
import { signupSchema, passwordSchema, resetUpdateSchema } from "@/features/auth/schema";

describe("passwordSchema", () => {
  it("8文字未満は拒否する", () => {
    expect(passwordSchema.safeParse("abc1234").success).toBe(false);
  });

  it("英字のみは拒否する", () => {
    expect(passwordSchema.safeParse("abcdefgh").success).toBe(false);
  });

  it("数字のみは拒否する", () => {
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
  });

  it("8文字以上で英数字を含めば許可する", () => {
    expect(passwordSchema.safeParse("abcd1234").success).toBe(true);
  });
});

describe("signupSchema", () => {
  const valid = { email: "rider@example.com", password: "abcd1234", displayName: "自転車太郎" };

  it("正しい入力を受け付ける", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it("メールアドレスの形式を検証する", () => {
    expect(signupSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("表示名は30文字まで", () => {
    expect(signupSchema.safeParse({ ...valid, displayName: "あ".repeat(30) }).success).toBe(true);
    expect(signupSchema.safeParse({ ...valid, displayName: "あ".repeat(31) }).success).toBe(false);
  });

  it("表示名は空にできない", () => {
    expect(signupSchema.safeParse({ ...valid, displayName: "   " }).success).toBe(false);
  });
});

describe("resetUpdateSchema", () => {
  it("確認用パスワードが一致しないと拒否する", () => {
    const result = resetUpdateSchema.safeParse({
      password: "abcd1234",
      passwordConfirm: "abcd9999",
    });
    expect(result.success).toBe(false);
  });

  it("一致すれば通す", () => {
    expect(
      resetUpdateSchema.safeParse({ password: "abcd1234", passwordConfirm: "abcd1234" }).success,
    ).toBe(true);
  });
});
