import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  CONDITIONS,
  DELIVERY_METHODS,
  PREFECTURES,
  TRANSACTION_STATUSES,
  isBikeCategory,
  labelOf,
  modelYearMax,
  priceNoteFor,
} from "@/lib/constants";

describe("ドメイン定数", () => {
  it("表示名の引き当てができ、知らない値では null", () => {
    expect(labelOf(CATEGORIES, "road")).toBe("ロードバイク");
    expect(labelOf(CONDITIONS, "new")).toBe("新品・未使用");
    expect(labelOf(PREFECTURES, "13")).toBe("東京都");
    expect(labelOf(CATEGORIES, "unknown")).toBeNull();
    expect(labelOf(PREFECTURES, "")).toBeNull();
  });

  it("都道府県は47件そろっている", () => {
    expect(PREFECTURES).toHaveLength(47);
    expect(PREFECTURES[0].label).toBe("北海道");
    expect(PREFECTURES[46].label).toBe("沖縄県");
    // コードは2桁ゼロ埋めで重複しない
    const codes = PREFECTURES.map((pref) => pref.value);
    expect(new Set(codes).size).toBe(47);
    expect(codes.every((code) => /^\d{2}$/.test(code))).toBe(true);
  });

  it("車体とそれ以外を見分ける", () => {
    expect(isBikeCategory("road")).toBe(true);
    expect(isBikeCategory("minivelo")).toBe(true);
    expect(isBikeCategory("parts")).toBe(false);
    expect(isBikeCategory("other")).toBe(false);
  });

  it("取引の状態はすべて日本語の表示名を持つ", () => {
    for (const status of TRANSACTION_STATUSES) {
      expect(status.label, status.value).not.toBe("");
      expect(status.label, status.value).not.toMatch(/^[a-z_]+$/);
    }
  });

  it("年式の上限は翌年まで", () => {
    const year = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear();
    expect(modelYearMax()).toBe(year + 1);
  });

  it("価格の横の注記は、送料が価格に含まれるかどうかを受渡方法ごとに言い分ける", () => {
    expect(labelOf(DELIVERY_METHODS, "shipping_collect")).toBe("配送(着払い)");
    expect(priceNoteFor("shipping")).toBe("送料込み・税込");
    expect(priceNoteFor("shipping_collect")).toBe("税込・送料は着払い");
    expect(priceNoteFor("in_person")).toBe("税込");
    expect(priceNoteFor(null)).toBe("税込");
  });
});
