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

/**
 * ブランド名の読み替え。左が入力(カタカナ)、右が brands.name に含まれる表記。
 *
 * ブランドは listings.brand_id の外部キーで持っているため、
 * listings 側の ILIKE では拾えず、ブランド名で探されると 0 件になってしまう。
 * さらに brands.name は英字表記なので、日本語で入力されても一致しない。
 */
const BRAND_ALIASES: Record<string, string> = {
  ピナレロ: "Pinarello",
  コルナゴ: "Colnago",
  ビアンキ: "Bianchi",
  キャノンデール: "Cannondale",
  キャニオン: "Canyon",
  サーヴェロ: "Cervélo",
  サーベロ: "Cervélo",
  ジャイアント: "Giant",
  メリダ: "Merida",
  トレック: "Trek",
  スペシャライズド: "Specialized",
  スペシャ: "Specialized",
  スコット: "Scott",
  ジオス: "GIOS",
  フジ: "FUJI",
  ラレー: "RALEIGH",
  ブロンプトン: "Brompton",
  ダホン: "DAHON",
  ターン: "tern",
  アンカー: "ANCHOR",
  ブリヂストン: "BRIDGESTONE",
  ブリジストン: "BRIDGESTONE",
  パナソニック: "Panasonic",
  ヤマハ: "YAMAHA",
  シマノ: "Shimano",
  カンパニョーロ: "Campagnolo",
  カンパ: "Campagnolo",
  スラム: "SRAM",
  マビック: "MAVIC",
  フルクラム: "FULCRUM",
  ネスト: "NESTO",
  コーダーブルーム: "KhodaaBloom",
  ルイガノ: "LOUIS GARNEAU",
  ビーエムシー: "BMC",
};

/**
 * キーワードに一致するブランドの id。該当が無ければ空配列。
 *
 * 英字表記はそのまま部分一致で、カタカナ表記は読み替えてから照合する。
 * 1 文字だけの語は誤爆が多いので読み替えの対象にしない。
 */
export function brandIdsForKeyword(
  word: string,
  brands: readonly { id: string; name: string }[],
): string[] {
  return brands.filter((brand) => brandMatches(word, brand.name)).map((brand) => brand.id);
}

/**
 * キーワードに一致するブランド名。検索窓の候補に使う。
 * 結果の絞り込みと同じ読み替えを通すので、
 * 候補に出た語で検索して 0 件になることがない。
 */
export function brandNamesForKeyword(word: string, names: readonly string[]): string[] {
  return names.filter((name) => brandMatches(word, name));
}

/** 入力語が、このブランド名を指しているか */
function brandMatches(word: string, brandName: string): boolean {
  const key = normalize(word);
  if (key.length === 0) return false;

  const terms = new Set<string>([key]);
  if (key.length >= 2) {
    for (const [kana, name] of Object.entries(BRAND_ALIASES)) {
      const alias = normalize(kana);
      if (alias.includes(key) || key.includes(alias)) terms.add(normalize(name));
    }
  }

  const target = normalize(brandName);
  return [...terms].some((term) => target.includes(term));
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
