import { describe, expect, it } from "vitest";
import {
  calcFee,
  priceError,
  canDeleteListing,
  canEditListing,
  canPurchase,
  canRepublishListing,
  canWithdrawListing,
  listingBadge,
} from "@/features/listing/rules";
import type { ListingStatus } from "@/lib/constants";

const ALL: ListingStatus[] = ["draft", "published", "trading", "sold", "withdrawn", "suspended"];

describe("canEditListing", () => {
  it("下書き・公開中・取下げのみ編集できる", () => {
    expect(ALL.filter(canEditListing)).toEqual(["draft", "published", "withdrawn"]);
  });

  it("取引中・売却済・運営非表示は編集できない", () => {
    expect(canEditListing("trading")).toBe(false);
    expect(canEditListing("sold")).toBe(false);
    expect(canEditListing("suspended")).toBe(false);
  });
});

describe("状態遷移ガード", () => {
  it("取下げは公開中のみ", () => {
    expect(ALL.filter(canWithdrawListing)).toEqual(["published"]);
  });

  it("再公開は取下げ中のみ(運営非表示は本人が戻せない)", () => {
    expect(ALL.filter(canRepublishListing)).toEqual(["withdrawn"]);
    expect(canRepublishListing("suspended")).toBe(false);
  });

  it("削除は下書きのみ", () => {
    expect(ALL.filter(canDeleteListing)).toEqual(["draft"]);
  });

  it("購入できるのは公開中のみ", () => {
    expect(ALL.filter(canPurchase)).toEqual(["published"]);
  });
});

describe("listingBadge", () => {
  it("公開中はバッジなし", () => {
    expect(listingBadge("published")).toBeNull();
  });

  it("取引中・売却済は専用トーンを返す", () => {
    expect(listingBadge("trading")).toEqual({ label: "取引中", tone: "trading" });
    expect(listingBadge("sold")).toEqual({ label: "SOLD", tone: "sold" });
  });

  it("非公開系は muted トーン", () => {
    expect(listingBadge("draft")?.tone).toBe("muted");
    expect(listingBadge("withdrawn")?.tone).toBe("muted");
    expect(listingBadge("suspended")?.tone).toBe("muted");
  });
});

describe("calcFee", () => {
  it("手数料は端数切り捨て", () => {
    expect(calcFee(10000, 0.1)).toEqual({ fee: 1000, payout: 9000 });
    expect(calcFee(9999, 0.1)).toEqual({ fee: 999, payout: 9000 });
    expect(calcFee(333, 0.1)).toEqual({ fee: 33, payout: 300 });
  });

  it("不正な価格は0を返す", () => {
    expect(calcFee(0, 0.1)).toEqual({ fee: 0, payout: 0 });
    expect(calcFee(-100, 0.1)).toEqual({ fee: 0, payout: 0 });
    expect(calcFee(Number.NaN, 0.1)).toEqual({ fee: 0, payout: 0 });
  });
});

describe("priceError", () => {
  it("3,000 円から 9,999,999 円までは出品できる", () => {
    expect(priceError(3000)).toBeNull();
    expect(priceError(9999999)).toBeNull();
  });

  it("範囲の外は、範囲を示して止める", () => {
    const message = "希望価格は3,000円〜9,999,999円で入力してください";
    expect(priceError(2999)).toBe(message);
    expect(priceError(300)).toBe(message);
    expect(priceError(0)).toBe(message);
    expect(priceError(10000000)).toBe(message);
  });

  it("未入力と、整数でない値も止める", () => {
    expect(priceError(null)).toBe("希望価格を入力してください");
    expect(priceError(3000.5)).not.toBeNull();
    expect(priceError(Number.NaN)).not.toBeNull();
  });
});
