import { describe, expect, it } from "vitest";
import {
  DELIVERY_METHODS,
  isCashOnDelivery,
  isShippingMethod,
  labelOf,
  priceNote,
} from "@/lib/constants";

describe("受渡方法", () => {
  it("送料込み・着払い・対面の3つを持つ", () => {
    expect(DELIVERY_METHODS.map((option) => option.value)).toEqual([
      "shipping",
      "shipping_cod",
      "in_person",
    ]);
  });

  it("ラベルが引ける", () => {
    expect(labelOf(DELIVERY_METHODS, "shipping_cod")).toBe("配送(着払い)");
    expect(labelOf(DELIVERY_METHODS, "unknown")).toBeNull();
  });

  describe("isShippingMethod", () => {
    it("着払いも配送として扱う", () => {
      // ここが false になると、発送連絡・受取確認・催促メールの文言が
      // 対面側に落ちて取引が止まる
      expect(isShippingMethod("shipping")).toBe(true);
      expect(isShippingMethod("shipping_cod")).toBe(true);
    });

    it("対面と未設定は配送ではない", () => {
      expect(isShippingMethod("in_person")).toBe(false);
      expect(isShippingMethod(null)).toBe(false);
      expect(isShippingMethod(undefined)).toBe(false);
    });
  });

  describe("isCashOnDelivery", () => {
    it("着払いだけを true にする", () => {
      expect(isCashOnDelivery("shipping_cod")).toBe(true);
      expect(isCashOnDelivery("shipping")).toBe(false);
      expect(isCashOnDelivery("in_person")).toBe(false);
      expect(isCashOnDelivery(null)).toBe(false);
    });
  });

  describe("priceNote", () => {
    it("送料が代金に含まれるかを言い分ける", () => {
      expect(priceNote("shipping")).toBe("送料込み・税込");
      expect(priceNote("in_person")).toBe("税込");
    });

    it("着払いは送料が別であることを示す", () => {
      // 「税込」だけだと、購入者は表示額だけで足りると受け取ってしまう
      expect(priceNote("shipping_cod")).toContain("着払い");
      expect(priceNote("shipping_cod")).not.toBe("税込");
    });

    it("未設定でも文言を返す(空にしない)", () => {
      expect(priceNote(null)).toBe("税込");
      expect(priceNote(undefined)).toBe("税込");
    });
  });

  it("すべての受渡方法に注記がある", () => {
    for (const option of DELIVERY_METHODS) {
      expect(priceNote(option.value).length, option.value).toBeGreaterThan(0);
    }
  });
});
