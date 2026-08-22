import { describe, expect, it } from "vitest";
import { canSubmitReview, resolveReviewPublication } from "@/features/review/rules";

const NOW = new Date("2026-08-22T00:00:00Z");
const BUYER = "buyer-id";
const SELLER = "seller-id";

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("resolveReviewPublication", () => {
  it("評価が無ければ何もしない", () => {
    expect(resolveReviewPublication([], daysAgo(1), NOW)).toEqual({
      publish: false,
      complete: false,
      requestReview: false,
    });
  });

  it("片方だけの評価は非公開のまま、相手へ依頼する", () => {
    const result = resolveReviewPublication(
      [{ reviewerId: BUYER, createdAt: daysAgo(1) }],
      daysAgo(2),
      NOW,
    );
    expect(result).toEqual({ publish: false, complete: false, requestReview: true });
  });

  it("双方が評価したら即時公開して完了させる", () => {
    const result = resolveReviewPublication(
      [
        { reviewerId: BUYER, createdAt: daysAgo(1) },
        { reviewerId: SELLER, createdAt: daysAgo(0) },
      ],
      daysAgo(2),
      NOW,
    );
    expect(result).toEqual({ publish: true, complete: true, requestReview: false });
  });

  it("片方の評価から14日経過で公開・完了する", () => {
    const result = resolveReviewPublication(
      [{ reviewerId: BUYER, createdAt: daysAgo(14) }],
      daysAgo(15),
      NOW,
    );
    expect(result).toEqual({ publish: true, complete: true, requestReview: false });
  });

  it("13日ではまだ公開しない(境界)", () => {
    const result = resolveReviewPublication(
      [{ reviewerId: BUYER, createdAt: daysAgo(13) }],
      daysAgo(14),
      NOW,
    );
    expect(result.publish).toBe(false);
    expect(result.complete).toBe(false);
  });

  it("評価ゼロのまま受取から14日経過したら完了だけさせる", () => {
    const result = resolveReviewPublication([], daysAgo(14), NOW);
    expect(result).toEqual({ publish: false, complete: true, requestReview: false });
  });

  it("受取確認前は完了させない", () => {
    expect(resolveReviewPublication([], null, NOW).complete).toBe(false);
  });

  it("同じ評価者の重複は1件として数える", () => {
    const result = resolveReviewPublication(
      [
        { reviewerId: BUYER, createdAt: daysAgo(1) },
        { reviewerId: BUYER, createdAt: daysAgo(0) },
      ],
      daysAgo(2),
      NOW,
    );
    expect(result.complete).toBe(false);
    expect(result.requestReview).toBe(true);
  });
});

describe("canSubmitReview", () => {
  it("受取確認後に当事者が未評価なら登録できる", () => {
    expect(canSubmitReview("received", true, false).allowed).toBe(true);
    expect(canSubmitReview("completed", true, false).allowed).toBe(true);
  });

  it("当事者でなければ登録できない", () => {
    const result = canSubmitReview("received", false, false);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("当事者ではありません");
  });

  it("評価済みなら再登録できない(変更不可)", () => {
    const result = canSubmitReview("received", true, true);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("すでに評価");
  });

  it("受取確認前は登録できない", () => {
    for (const status of ["pending_payment", "paid", "shipped", "canceled"]) {
      const result = canSubmitReview(status, true, false);
      expect(result.allowed).toBe(false);
    }
  });
});
