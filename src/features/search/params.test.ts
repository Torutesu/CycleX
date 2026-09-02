import { describe, expect, it } from "vitest";
import {
  hasActiveFilters,
  parseSearchParams,
  splitKeywords,
  toQueryString,
  brandIdsForKeyword,
  categoriesForKeyword,
  partsSubcategoriesForKeyword,
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

describe("categoriesForKeyword", () => {
  it("カテゴリの表示名そのままで一致する", () => {
    expect(categoriesForKeyword("ロードバイク")).toEqual(["road"]);
    expect(categoriesForKeyword("クロスバイク")).toEqual(["cross"]);
    expect(categoriesForKeyword("ミニベロ")).toEqual(["minivelo"]);
  });

  it("表示名の一部でも拾う", () => {
    expect(categoriesForKeyword("ロード")).toContain("road");
    expect(categoriesForKeyword("マウンテン")).toContain("mtb");
  });

  it("呼び名の揺れを吸収する", () => {
    expect(categoriesForKeyword("MTB")).toContain("mtb");
    expect(categoriesForKeyword("mtb")).toContain("mtb");
    expect(categoriesForKeyword("ママチャリ")).toContain("city");
    expect(categoriesForKeyword("電動")).toContain("ebike");
    expect(categoriesForKeyword("e-bike")).toContain("ebike");
  });

  it("「バイク」のように複数に当たる語は該当をすべて返す", () => {
    const hit = categoriesForKeyword("バイク");
    expect(hit).toEqual(expect.arrayContaining(["road", "cross", "mtb"]));
  });

  it("カテゴリと関係ない語では何も返さない", () => {
    expect(categoriesForKeyword("Trek")).toEqual([]);
    expect(categoriesForKeyword("Domane")).toEqual([]);
    expect(categoriesForKeyword("")).toEqual([]);
  });
});

describe("partsSubcategoriesForKeyword", () => {
  it("パーツ種別の名前で一致する", () => {
    expect(partsSubcategoriesForKeyword("ホイール")).toEqual(["wheel"]);
    expect(partsSubcategoriesForKeyword("サドル")).toEqual(["saddle"]);
  });

  it("関係ない語では何も返さない", () => {
    expect(partsSubcategoriesForKeyword("Shimano")).toEqual([]);
  });
});

describe("brandIdsForKeyword", () => {
  const brands = [
    { id: "b-pinarello", name: "Pinarello" },
    { id: "b-colnago", name: "Colnago" },
    { id: "b-shimano", name: "Shimano" },
    { id: "b-louis", name: "LOUIS GARNEAU" },
    { id: "b-trek", name: "Trek" },
  ];

  it("英字表記でそのまま一致する", () => {
    expect(brandIdsForKeyword("Pinarello", brands)).toEqual(["b-pinarello"]);
    expect(brandIdsForKeyword("trek", brands)).toEqual(["b-trek"]);
  });

  it("カタカナ表記を英字表記に読み替える", () => {
    expect(brandIdsForKeyword("ピナレロ", brands)).toEqual(["b-pinarello"]);
    expect(brandIdsForKeyword("コルナゴ", brands)).toEqual(["b-colnago"]);
    expect(brandIdsForKeyword("シマノ", brands)).toEqual(["b-shimano"]);
  });

  it("空白入りのブランド名も読み替えられる", () => {
    expect(brandIdsForKeyword("ルイガノ", brands)).toEqual(["b-louis"]);
  });

  it("前方一致でも拾う", () => {
    expect(brandIdsForKeyword("ピナ", brands)).toEqual(["b-pinarello"]);
  });

  it("1 文字の語では読み替えない", () => {
    expect(brandIdsForKeyword("ピ", brands)).toEqual([]);
  });

  it("ブランドと関係ない語では何も返さない", () => {
    expect(brandIdsForKeyword("ロードバイク", brands)).toEqual([]);
    expect(brandIdsForKeyword("", brands)).toEqual([]);
  });
});
