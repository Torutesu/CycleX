import { describe, expect, it, vi, afterEach } from "vitest";
import { AppError, fail, isUniqueViolation, ok, toUserMessage } from "@/lib/errors";

describe("Server Action の戻り値", () => {
  afterEach(() => vi.restoreAllMocks());

  it("成功と失敗を取り違えない", () => {
    expect(ok()).toEqual({ ok: true, data: undefined });
    expect(ok({ id: "abc" })).toEqual({ ok: true, data: { id: "abc" } });
    expect(fail("入力を確認してください")).toEqual({
      ok: false,
      error: "入力を確認してください",
      fieldErrors: undefined,
    });
    expect(fail("入力を確認してください", { email: ["形式が不正です"] })).toEqual({
      ok: false,
      error: "入力を確認してください",
      fieldErrors: { email: ["形式が不正です"] },
    });
  });

  it("業務ルール違反はそのまま画面に出す", () => {
    expect(toUserMessage(new AppError("自分が出品した商品は購入できません。"))).toBe(
      "自分が出品した商品は購入できません。",
    );
  });

  it("想定外の例外は中身を伏せ、ログにだけ残す", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const message = toUserMessage(new Error("connect ECONNREFUSED 127.0.0.1:54321"));
    expect(message).toBe("処理に失敗しました。時間をおいて再度お試しください。");
    expect(message).not.toContain("ECONNREFUSED");
    expect(spy).toHaveBeenCalled();

    // 文字列や null が飛んできても落ちない
    expect(toUserMessage("なにか")).toContain("処理に失敗しました");
    expect(toUserMessage(null)).toContain("処理に失敗しました");
    expect(toUserMessage(undefined, "保存できませんでした")).toBe("保存できませんでした");
  });

  it("一意制約違反だけを見分ける", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});
