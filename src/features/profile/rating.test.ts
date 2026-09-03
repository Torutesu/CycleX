import { describe, expect, it } from "vitest";
import { summarizeRatings } from "@/features/profile/rating";

describe("summarizeRatings", () => {
  it("平均と星ごとの件数を出す", () => {
    const summary = summarizeRatings([5, 5, 5, 4, 4, 3]);
    expect(summary.count).toBe(6);
    expect(summary.average).toBe(4.3);
    expect(summary.breakdown).toEqual({ 1: 0, 2: 0, 3: 1, 4: 2, 5: 3 });
  });

  it("評価が無ければ平均は null、内訳はすべて0", () => {
    const summary = summarizeRatings([]);
    expect(summary).toEqual({
      average: null,
      count: 0,
      breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it("平均は小数第1位まで", () => {
    expect(summarizeRatings([5, 4]).average).toBe(4.5);
    expect(summarizeRatings([5, 5, 4]).average).toBe(4.7);
  });

  it("範囲外の値は1〜5に丸める", () => {
    const summary = summarizeRatings([0, 6, 3]);
    expect(summary.breakdown[1]).toBe(1);
    expect(summary.breakdown[5]).toBe(1);
    expect(summary.breakdown[3]).toBe(1);
  });
});
