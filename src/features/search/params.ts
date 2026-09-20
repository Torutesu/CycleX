import {
  CATEGORIES,
  CONDITIONS,
  FRAME_SIZES,
  PAGE_SIZE,
  PARTS_SUBCATEGORIES,
  PREFECTURES,
  PRICE_MAX,
  SORT_OPTIONS,
  optionValues,
  type SortOption,
} from "@/lib/constants";

const CATEGORY_VALUES = optionValues(CATEGORIES) as readonly string[];
const SUBCATEGORY_VALUES = optionValues(PARTS_SUBCATEGORIES) as readonly string[];
const CONDITION_VALUES = optionValues(CONDITIONS) as readonly string[];
const SIZE_VALUES = optionValues(FRAME_SIZES) as readonly string[];
const PREF_VALUES = optionValues(PREFECTURES) as readonly string[];
const SORT_VALUES = optionValues(SORT_OPTIONS) as readonly string[];

/** URL クエリから受け取る生の値(Next.js の searchParams と同じ形) */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export type SearchParams = {
  q: string;
  category: string | null;
  sub: string | null;
  brand: string[];
  priceMin: number | null;
  priceMax: number | null;
  size: string[];
  pref: string[];
  condition: string[];
  includeSold: boolean;
  sort: SortOption;
  page: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 単一値を取り出す(配列で来た場合は先頭) */
function single(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** 複数値を配列にし、許可された値だけを残して重複を除く */
function multi(value: string | string[] | undefined, allowed: readonly string[]): string[] {
  const raw = Array.isArray(value) ? value : value ? value.split(",") : [];
  const filtered = raw
    .map((item) => item.trim())
    .filter((item) => allowed.length === 0 || allowed.includes(item));
  return [...new Set(filtered)];
}

function toPositiveInt(value: string | null, max = Number.MAX_SAFE_INTEGER): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    return null;
  }
  return parsed;
}

/**
 * 検索条件の正規化。
 * 不正な値は throw せず、無視してデフォルトへ落とす(URL は誰でも編集できるため)。
 */
export function parseSearchParams(raw: RawSearchParams): SearchParams {
  const category = single(raw.category);
  const sub = single(raw.sub);
  const sort = single(raw.sort);
  const page = toPositiveInt(single(raw.page)) ?? 1;

  let priceMin = toPositiveInt(single(raw.price_min), PRICE_MAX);
  let priceMax = toPositiveInt(single(raw.price_max), PRICE_MAX);
  // 下限と上限が逆転している場合は入れ替える
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    [priceMin, priceMax] = [priceMax, priceMin];
  }

  return {
    q: (single(raw.q) ?? "").trim().slice(0, 100),
    category: category && CATEGORY_VALUES.includes(category) ? category : null,
    // サブカテゴリはパーツを選んでいるときのみ有効
    sub: category === "parts" && sub && SUBCATEGORY_VALUES.includes(sub) ? sub : null,
    brand: multi(raw.brand, []).filter((id) => UUID_PATTERN.test(id)),
    priceMin,
    priceMax,
    size: multi(raw.size, SIZE_VALUES),
    pref: multi(raw.pref, PREF_VALUES),
    condition: multi(raw.condition, CONDITION_VALUES),
    includeSold: single(raw.include_sold) === "1",
    sort: (sort && SORT_VALUES.includes(sort) ? sort : "new") as SortOption,
    page: Math.max(1, page),
  };
}

/** キーワードを検索語に分割する(全角スペースにも対応) */
export function splitKeywords(query: string): string[] {
  return query
    .split(/[\s　]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .slice(0, 5);
}

/**
 * カテゴリ名で検索されたときの読み替え(FR-04-1 の補完)。
 *
 * キーワード検索の対象はタイトル・説明・モデル名・ブランド名だが、
 * 「ロードバイク」のようにカテゴリの呼び名で探す人が多く、
 * そのままだと該当商品があっても 0 件になってしまう。
 * 呼び名が一致したカテゴリの商品も検索結果に含める。
 */

/** 表記ゆれの吸収。左が入力、右がカテゴリの値 */
const CATEGORY_ALIASES: Record<string, string> = {
  ロード: "road",
  クロス: "cross",
  mtb: "mtb",
  マウンテン: "mtb",
  ママチャリ: "city",
  シティ: "city",
  電動: "ebike",
  ebike: "ebike",
  "e-bike": "ebike",
  イーバイク: "ebike",
  ミニベロ: "minivelo",
  小径: "minivelo",
};

/**
 * ひらがなをカタカナに寄せる。
 * 「ぴなれろ」と打たれても「ピナレロ」の読み替えに当てるため。
 */
function toKatakana(value: string): string {
  return value.replace(/[\u3041-\u3096]/g, (char) =>
    String.fromCodePoint(char.codePointAt(0)! + 0x60),
  );
}

/**
 * 日本語入力のゆれを吸収する。
 *
 * 日本語 IME は「ＴＲＥＫ」のような全角英数や半角カナを普通に出すので、
 * NFKC で半角英数・全角カナへ寄せてから比べる。
 */
function normalize(value: string): string {
  return toKatakana(value.normalize("NFKC"))
    .toLowerCase()
    .replace(/[\s　・]/g, "");
}

/**
 * 本文の部分一致に使う綴りの候補。
 *
 * 出品の表記も入力も全角と半角が混ざるため、どちらで打たれても
 * 当たるよう両方の綴りで探す。
 */
export function keywordVariants(word: string): string[] {
  const normalized = word.normalize("NFKC");
  return normalized === word ? [word] : [word, normalized];
}

/** キーワードに対応するカテゴリの値。該当が無ければ空配列 */
export function categoriesForKeyword(word: string): string[] {
  const key = normalize(word);
  if (key.length === 0) return [];

  const matched = new Set<string>();

  // 表示名との部分一致(「ロードバイク」「ロード」いずれも拾う)
  for (const option of CATEGORIES) {
    if (normalize(option.label).includes(key)) matched.add(option.value);
  }
  // 呼び名の読み替え
  const alias = CATEGORY_ALIASES[key];
  if (alias) matched.add(alias);

  return [...matched];
}

/** 絞り込みや候補に使うブランド。カナ読みは brands.name_kana から来る */
export type BrandOption = { id: string; name: string; kana: string | null };

/**
 * ブランド名の略称・表記ゆれ。左が入力、右が brands.name の表記。
 *
 * 正式なカナ読みは brands.name_kana に持たせてあるので、
 * ここに置くのは読みから素直に導けない呼び方だけにする。
 */
const BRAND_NICKNAMES: Record<string, string> = {
  スペシャ: "Specialized",
  カンパ: "Campagnolo",
  ブリジストン: "Bridgestone",
  アンカー: "ANCHOR",
  サーベロ: "Cervélo",
  メルクス: "Eddy Merckx",
  エスワークス: "S-WORKS",
  コーダブルーム: "Khodaa-Bloom",
  ルイガノー: "Louis Garneau",
};

/**
 * キーワードに一致するブランドの id。該当が無ければ空配列。
 *
 * 英字表記・カナ読みのどちらで打たれても拾う。
 */
export function brandIdsForKeyword(word: string, brands: readonly BrandOption[]): string[] {
  return brands.filter((brand) => brandMatches(word, brand)).map((brand) => brand.id);
}

/**
 * キーワードに一致するブランド名。検索窓の候補に使う。
 * 結果の絞り込みと同じ読み替えを通すので、
 * 候補に出た語で検索して 0 件になることがない。
 */
export function brandNamesForKeyword(
  word: string,
  brands: readonly Pick<BrandOption, "name" | "kana">[],
): string[] {
  return brands.filter((brand) => brandMatches(word, brand)).map((brand) => brand.name);
}

/**
 * 入力語が、このブランドを指しているか。
 *
 * 英字表記は部分一致。カナは 1 文字だと当たりすぎるので 2 文字から見る
 * (「ス」で数十件出ても選べない)。
 */
export function brandMatches(word: string, brand: Pick<BrandOption, "name" | "kana">): boolean {
  const key = normalize(word);
  if (key.length === 0) return false;

  const name = normalize(brand.name);
  if (name.includes(key)) return true;
  if (key.length < 2) return false;

  const kana = brand.kana ? normalize(brand.kana) : "";
  if (kana.includes(key)) return true;

  // 略称・表記ゆれ(「スペシャ」「ブリジストン」)
  return Object.entries(BRAND_NICKNAMES).some(([nickname, brandName]) => {
    const alias = normalize(nickname);
    return (alias.includes(key) || key.includes(alias)) && name === normalize(brandName);
  });
}

/** キーワードに対応するパーツ種別の値。該当が無ければ空配列 */
export function partsSubcategoriesForKeyword(word: string): string[] {
  const key = normalize(word);
  if (key.length === 0) return [];

  return PARTS_SUBCATEGORIES.filter((option) => normalize(option.label).includes(key)).map(
    (option) => option.value,
  );
}

/** 検索条件を URL クエリ文字列へ戻す(ページ指定は上書き可能) */
export function toQueryString(params: SearchParams, overrides: Partial<SearchParams> = {}): string {
  const merged = { ...params, ...overrides };
  const query = new URLSearchParams();

  if (merged.q) query.set("q", merged.q);
  if (merged.category) query.set("category", merged.category);
  if (merged.sub) query.set("sub", merged.sub);
  for (const id of merged.brand) query.append("brand", id);
  if (merged.priceMin !== null) query.set("price_min", String(merged.priceMin));
  if (merged.priceMax !== null) query.set("price_max", String(merged.priceMax));
  for (const size of merged.size) query.append("size", size);
  for (const pref of merged.pref) query.append("pref", pref);
  for (const condition of merged.condition) query.append("condition", condition);
  if (merged.includeSold) query.set("include_sold", "1");
  if (merged.sort !== "new") query.set("sort", merged.sort);
  if (merged.page > 1) query.set("page", String(merged.page));

  return query.toString();
}

/** 適用中の絞り込みがあるか(チップ表示と「条件をクリア」の出し分けに使う) */
export function hasActiveFilters(params: SearchParams): boolean {
  return Boolean(
    params.category ||
    params.brand.length ||
    params.priceMin !== null ||
    params.priceMax !== null ||
    params.size.length ||
    params.pref.length ||
    params.condition.length ||
    params.includeSold,
  );
}

export const SEARCH_PAGE_SIZE = PAGE_SIZE;
