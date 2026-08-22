import { describe, expect, it } from "vitest";
import {
  hasActiveFilters,
  parseSearchParams,
  splitKeywords,
  toQueryString,
} from "@/features/search/params";

describe("parseSearchParams", () => {
  it("空の入力にデフォルトを与える", () => {
    const params = parseSearchParams({});
    expect(params).toMatchObject({
      q: "",
      category: null,
      sub: null,
      brand: [],
      priceMin: null,
      priceMax: null,
      includeSold: false,
      sort: "new",
      page: 1,
    });
  });

  it("不正なカテゴリ・並び順は無視してデフォルトへ落とす", () => {
    const params = parseSearchParams({ category: "spaceship", sort: "random" });
    expect(params.category).toBeNull();
    expect(params.sort).toBe("new");
  });

  it("サブカテゴリはパーツ選択時のみ有効", () => {
    expect(parseSearchParams({ category: "road", sub: "wheel" }).sub).toBeNull();
    expect(parseSearchParams({ category: "parts", sub: "wheel" }).sub).toBe("wheel");
  });

  it("複数値はカンマ区切りでも配列でも受け取り、重複を除く", () => {
    expect(parseSearchParams({ size: "S,M,S" }).size).toEqual(["S", "M"]);
    expect(parseSearchParams({ size: ["S", "M"] }).size).toEqual(["S", "M"]);
  });

  it("許可されない値は落とす", () => {
    expect(parseSearchParams({ size: "S,XXXL" }).size).toEqual(["S"]);
    expect(parseSearchParams({ pref: "13,99" }).pref).toEqual(["13"]);
    expect(parseSearchParams({ condition: "good,broken" }).condition).toEqual(["good"]);
  });

  it("ブランドは UUID のみ受け付ける", () => {
    const uuid = "3f9a1b2c-1111-4222-8333-444455556666";
    expect(parseSearchParams({ brand: `${uuid},not-a-uuid` }).brand).toEqual([uuid]);
  });

  it("価格の下限と上限が逆なら入れ替える", () => {
    const params = parseSearchParams({ price_min: "50000", price_max: "10000" });
    expect(params.priceMin).toBe(10000);
    expect(params.priceMax).toBe(50000);
  });

  it("負数や非数値の価格は無視する", () => {
    expect(parseSearchParams({ price_min: "-5" }).priceMin).toBeNull();
    expect(parseSearchParams({ price_max: "abc" }).priceMax).toBeNull();
  });

  it("ページは1以上に丸める", () => {
    expect(parseSearchParams({ page: "0" }).page).toBe(1);
    expect(parseSearchParams({ page: "-3" }).page).toBe(1);
    expect(parseSearchParams({ page: "3" }).page).toBe(3);
  });

  it("キーワードは100文字で切り詰める", () => {
    expect(parseSearchParams({ q: "あ".repeat(200) }).q).toHaveLength(100);
  });
});

describe("splitKeywords", () => {
  it("半角・全角スペースの両方で分割する", () => {
    expect(splitKeywords("TREK　Emonda SL5")).toEqual(["TREK", "Emonda", "SL5"]);
  });

  it("空文字と余分な空白を除く", () => {
    expect(splitKeywords("  　 ")).toEqual([]);
    expect(splitKeywords(" TREK  ")).toEqual(["TREK"]);
  });

  it("語は最大5つまで", () => {
    expect(splitKeywords("a b c d e f g")).toHaveLength(5);
  });
});

describe("toQueryString", () => {
  it("デフォルト値はクエリに出さない", () => {
    const params = parseSearchParams({});
    expect(toQueryString(params)).toBe("");
  });

  it("条件を往復させても同じ結果になる", () => {
    const original = parseSearchParams({
      q: "TREK",
      category: "road",
      size: ["M", "L"],
      price_min: "10000",
      sort: "price_asc",
      page: "2",
    });
    const restored = parseSearchParams(
      Object.fromEntries(new URLSearchParams(toQueryString(original)).entries()),
    );

    expect(restored.q).toBe(original.q);
    expect(restored.category).toBe(original.category);
    expect(restored.priceMin).toBe(original.priceMin);
    expect(restored.sort).toBe(original.sort);
    expect(restored.page).toBe(original.page);
  });

  it("overrides でページを差し替えられる", () => {
    const params = parseSearchParams({ q: "TREK", page: "5" });
    expect(toQueryString(params, { page: 1 })).toBe("q=TREK");
  });
});

describe("hasActiveFilters", () => {
  it("キーワードだけでは絞り込み扱いにしない", () => {
    expect(hasActiveFilters(parseSearchParams({ q: "TREK" }))).toBe(false);
  });

  it("いずれかの条件があれば true", () => {
    expect(hasActiveFilters(parseSearchParams({ category: "road" }))).toBe(true);
    expect(hasActiveFilters(parseSearchParams({ size: "M" }))).toBe(true);
    expect(hasActiveFilters(parseSearchParams({ include_sold: "1" }))).toBe(true);
  });
});
