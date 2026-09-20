import { describe, it, expect } from "vitest";
import { COMPANY, companyFields, contactEmail } from "@/lib/company";

/**
 * 事業者情報の器。
 * 埋まっていない項目をそれらしく見せないこと(空欄の行や mailto: の空リンクを出さないこと)を見張る。
 */
describe("事業者情報", () => {
  it("空の項目は画面に出さない", () => {
    const labels = companyFields().map((field) => field.label);
    for (const field of companyFields()) {
      expect(field.value.trim().length).toBeGreaterThan(0);
    }
    // 重複した見出しを出さない
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("メールアドレスが未設定なら問い合わせ導線を出さない", () => {
    if (COMPANY.email.trim().length === 0) {
      expect(contactEmail()).toBeNull();
    } else {
      expect(contactEmail()).toBe(COMPANY.email.trim());
    }
  });
});
