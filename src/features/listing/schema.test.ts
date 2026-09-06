import { describe, expect, it } from "vitest";
import { draftSchema, publishSchema, toListingRow } from "@/features/listing/schema";

const BRAND_ID = "3f9a1b2c-1111-4222-8333-444455556666";

/** 公開可能な最小の入力 */
function validInput(overrides: Record<string, unknown> = {}) {
  return {
    category: "road",
    title: "TREK Emonda SL5 2021年",
    brandId: BRAND_ID,
    condition: "good",
    description: "きれいな状態のロードバイクです。試乗のみで使用しています。",
    price: 150000,
    deliveryMethod: "shipping",
    shippingFromPref: "13",
    imagePaths: ["user-id/a.jpg"],
    ...overrides,
  };
}

function errorPaths(result: { success: false; error: { issues: { path: PropertyKey[] }[] } }) {
  return result.error.issues.map((issue) => issue.path.join("."));
}

describe("draftSchema", () => {
  it("タイトルだけあれば保存できる", () => {
    const result = draftSchema.safeParse({ title: "あとで書く", imagePaths: [] });
    expect(result.success).toBe(true);
  });

  it("タイトルが空だと拒否する", () => {
    const result = draftSchema.safeParse({ title: "", imagePaths: [] });
    expect(result.success).toBe(false);
  });
});

describe("publishSchema", () => {
  it("必須項目が揃っていれば通る", () => {
    expect(publishSchema.safeParse(validInput()).success).toBe(true);
  });

  it("タイトルは5文字以上", () => {
    const result = publishSchema.safeParse(validInput({ title: "TREK" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(errorPaths(result)).toContain("title");
  });

  it("パーツはサブカテゴリが必須", () => {
    const result = publishSchema.safeParse(validInput({ category: "parts" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(errorPaths(result)).toContain("partsSubcategory");

    expect(
      publishSchema.safeParse(validInput({ category: "parts", partsSubcategory: "wheel" })).success,
    ).toBe(true);
  });

  it("ブランドはマスタ選択か自由入力のいずれかが必要", () => {
    const missing = publishSchema.safeParse(validInput({ brandId: null }));
    expect(missing.success).toBe(false);
    if (!missing.success) expect(errorPaths(missing)).toContain("brandId");

    expect(
      publishSchema.safeParse(validInput({ brandId: null, brandOther: "自作フレーム" })).success,
    ).toBe(true);
  });

  it("対面受渡は受渡地域が必須", () => {
    const result = publishSchema.safeParse(validInput({ deliveryMethod: "in_person" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(errorPaths(result)).toContain("meetupPref");

    expect(
      publishSchema.safeParse(validInput({ deliveryMethod: "in_person", meetupPref: "27" }))
        .success,
    ).toBe(true);
  });

  it("価格の境界値を検証する", () => {
    expect(publishSchema.safeParse(validInput({ price: 299 })).success).toBe(false);
    expect(publishSchema.safeParse(validInput({ price: 300 })).success).toBe(true);
    expect(publishSchema.safeParse(validInput({ price: 9999999 })).success).toBe(true);
    expect(publishSchema.safeParse(validInput({ price: 10000000 })).success).toBe(false);
  });

  it("商品説明は10文字以上", () => {
    const result = publishSchema.safeParse(validInput({ description: "きれい" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(errorPaths(result)).toContain("description");
  });

  it("画像が0枚だと公開できない", () => {
    const result = publishSchema.safeParse(validInput({ imagePaths: [] }));
    expect(result.success).toBe(false);
    if (!result.success) expect(errorPaths(result)).toContain("imagePaths");
  });

  it("画像は10枚まで", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `user-id/${i}.jpg`);
    expect(publishSchema.safeParse(validInput({ imagePaths: eleven })).success).toBe(false);
  });

  it("年式の範囲を検証する", () => {
    expect(publishSchema.safeParse(validInput({ modelYear: 1979 })).success).toBe(false);
    expect(publishSchema.safeParse(validInput({ modelYear: 2020 })).success).toBe(true);
    expect(publishSchema.safeParse(validInput({ modelYear: 3000 })).success).toBe(false);
  });

  it("未知の選択値は null として扱う", () => {
    const result = publishSchema.safeParse(validInput({ mileage: "unknown-value" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mileage).toBeNull();
  });
});

describe("toListingRow", () => {
  it("パーツでは車体固有の項目を落とす", () => {
    const parsed = publishSchema.parse(
      validInput({
        category: "parts",
        partsSubcategory: "wheel",
        frameSize: "M",
        frameSizeCm: 52,
        mileage: "lte500",
      }),
    );
    const row = toListingRow(parsed);

    expect(row.parts_subcategory).toBe("wheel");
    expect(row.frame_size).toBeNull();
    expect(row.frame_size_cm).toBeNull();
    expect(row.mileage).toBeNull();
  });

  it("車体ではフレームサイズを保持し、サブカテゴリは持たない", () => {
    const parsed = publishSchema.parse(
      validInput({ frameSize: "M", frameSizeCm: 52, partsSubcategory: "wheel" }),
    );
    const row = toListingRow(parsed);

    expect(row.frame_size).toBe("M");
    expect(row.frame_size_cm).toBe(52);
    expect(row.parts_subcategory).toBeNull();
  });

  it("配送のときは受渡地域を持たない", () => {
    const parsed = publishSchema.parse(validInput({ meetupPref: "27" }));
    expect(toListingRow(parsed).meetup_pref).toBeNull();
  });
});
