import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  SEARCH_PAGE_SIZE,
  brandIdsForKeyword,
  categoriesForKeyword,
  partsSubcategoriesForKeyword,
  splitKeywords,
  type SearchParams,
} from "@/features/search/params";
import { CATEGORIES, type ListingStatus } from "@/lib/constants";

export type ListingCardData = {
  id: string;
  title: string;
  price: number | null;
  status: ListingStatus;
  category: string;
  frameSize: string | null;
  shippingFromPref: string | null;
  meetupPref: string | null;
  favoritesCount: number;
  publishedAt: string | null;
  thumbnailPath: string | null;
  brandName: string | null;
};

type ListingRow = {
  id: string;
  title: string;
  price: number | null;
  status: string;
  category: string;
  frame_size: string | null;
  shipping_from_pref: string | null;
  meetup_pref: string | null;
  favorites_count: number;
  published_at: string | null;
  listing_images: { path: string; position: number }[] | null;
  brands: { name: string } | null;
};

const CARD_SELECT =
  "id, title, price, status, category, frame_size, shipping_from_pref, meetup_pref, favorites_count, published_at, listing_images(path, position), brands(name)";

export function toCard(row: ListingRow): ListingCardData {
  const thumbnail = [...(row.listing_images ?? [])].sort((a, b) => a.position - b.position)[0];
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    status: row.status as ListingStatus,
    category: row.category,
    frameSize: row.frame_size,
    shippingFromPref: row.shipping_from_pref,
    meetupPref: row.meetup_pref,
    favoritesCount: row.favorites_count,
    publishedAt: row.published_at,
    thumbnailPath: thumbnail?.path ?? null,
    brandName: row.brands?.name ?? null,
  };
}

export type SearchResult = {
  items: ListingCardData[];
  total: number;
  totalPages: number;
};

/**
 * FR-04: 商品検索。
 * キーワードは pg_trgm による部分一致(ADR #4)。語ごとの AND、フィールド間は OR。
 */
export async function searchListings(params: SearchParams): Promise<SearchResult> {
  const supabase = await createClient();
  const statuses: ListingStatus[] = params.includeSold
    ? ["published", "trading", "sold"]
    : ["published", "trading"];

  let query = supabase
    .from("listings")
    .select(CARD_SELECT, { count: "exact" })
    .in("status", statuses);

  const words = splitKeywords(params.q);
  // ブランドは外部キーなので listings 側の ILIKE では拾えない。
  // 30 件程度の小さな表なので一度だけ引いて、語ごとに id へ読み替える。
  const brands = words.length > 0 ? await getBrandOptions() : [];

  // キーワード: 語ごとに AND、各語はタイトル/説明/モデル名/自由入力ブランドの OR。
  // 「ロードバイク」のようにカテゴリの呼び名で探された場合は、そのカテゴリの商品も含める。
  for (const word of words) {
    const pattern = `%${escapeLike(word)}%`;
    const conditions = [
      `title.ilike.${pattern}`,
      `description.ilike.${pattern}`,
      `model_name.ilike.${pattern}`,
      `brand_other.ilike.${pattern}`,
    ];

    const categories = categoriesForKeyword(word);
    if (categories.length > 0) conditions.push(`category.in.(${categories.join(",")})`);

    const subcategories = partsSubcategoriesForKeyword(word);
    if (subcategories.length > 0) {
      conditions.push(`parts_subcategory.in.(${subcategories.join(",")})`);
    }

    const brandIds = brandIdsForKeyword(word, brands);
    if (brandIds.length > 0) conditions.push(`brand_id.in.(${brandIds.join(",")})`);

    query = query.or(conditions.join(","));
  }

  if (params.category) query = query.eq("category", params.category);
  if (params.sub) query = query.eq("parts_subcategory", params.sub);
  if (params.brand.length > 0) query = query.in("brand_id", params.brand);
  if (params.priceMin !== null) query = query.gte("price", params.priceMin);
  if (params.priceMax !== null) query = query.lte("price", params.priceMax);
  if (params.size.length > 0) query = query.in("frame_size", params.size);
  if (params.condition.length > 0) query = query.in("condition", params.condition);
  if (params.pref.length > 0) {
    // 配送は発送元、対面は受渡地域のいずれかが一致すればヒットさせる
    const list = params.pref.join(",");
    query = query.or(`shipping_from_pref.in.(${list}),meetup_pref.in.(${list})`);
  }

  switch (params.sort) {
    case "price_asc":
      query = query.order("price", { ascending: true, nullsFirst: false });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false, nullsFirst: false });
      break;
    case "popular":
      query = query
        .order("favorites_count", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order("published_at", { ascending: false, nullsFirst: false });
  }

  const from = (params.page - 1) * SEARCH_PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + SEARCH_PAGE_SIZE - 1);

  if (error) {
    console.error("[search failed]", error);
    return { items: [], total: 0, totalPages: 0 };
  }

  const total = count ?? 0;
  return {
    items: (data ?? []).map((row) => toCard(row as unknown as ListingRow)),
    total,
    totalPages: Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE)),
  };
}

/**
 * ILIKE のワイルドカードと、PostgREST のフィルタ構文で意味を持つ記号を無効化する。
 *
 * - `% _ \\` : SQL の LIKE パターン
 * - `*`       : PostgREST が `%` として解釈するワイルドカード
 * - `, ( ) "` : `or=(...)` の区切りとして解釈される
 */
function escapeLike(value: string): string {
  return value
    .replace(/[%_\\]/g, (match) => `\\${match}`)
    .replace(/[*,()"]/g, " ")
    .trim();
}

/** ホーム用: 新着の公開商品 */
export async function getNewestListings(limit = 12): Promise<ListingCardData[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select(CARD_SELECT)
    .in("status", ["published", "trading"])
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  return (data ?? []).map((row) => toCard(row as unknown as ListingRow));
}

/** ホーム用: お気に入りの多い商品 */
export async function getPopularListings(limit = 12): Promise<ListingCardData[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select(CARD_SELECT)
    .eq("status", "published")
    .gt("favorites_count", 0)
    .order("favorites_count", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => toCard(row as unknown as ListingRow));
}

/** 出品者の他の公開商品(商品詳細・公開プロフィールで使う) */
export async function getListingsBySeller(
  sellerId: string,
  options: { excludeId?: string; limit?: number } = {},
): Promise<ListingCardData[]> {
  const supabase = await createClient();
  let query = supabase
    .from("listings")
    .select(CARD_SELECT)
    .eq("seller_id", sellerId)
    .in("status", ["published", "trading"])
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(options.limit ?? 6);

  if (options.excludeId) query = query.neq("id", options.excludeId);

  const { data } = await query;
  return (data ?? []).map((row) => toCard(row as unknown as ListingRow));
}

/**
 * 検索フィルタに出すブランド一覧。
 * 同じリクエストの中でフィルタ表示とキーワード読み替えの両方から呼ばれるため memo 化する。
 */
export const getBrandOptions = cache(async function getBrandOptions(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("brands")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
});

/**
 * カテゴリごとの出品数。
 *
 * 「ロードバイク」を押した先に何台あるのか分からないまま
 * 選ばせるのは不親切なので、入口の時点で件数を出す。
 * カテゴリは8つと固定なので、件数だけを並列に数える
 * (head:true なので行は転送されない)。
 */
export const getCategoryCounts = cache(async function getCategoryCounts(): Promise<
  Map<string, number>
> {
  const supabase = await createClient();
  const results = await Promise.all(
    CATEGORIES.map(async (category) => {
      const { count } = await supabase
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("category", category.value)
        .in("status", ["published", "trading"]);
      return [category.value, count ?? 0] as const;
    }),
  );
  return new Map(results);
});

/** 出品者が公開している商品の件数(商品ページの導線に出す) */
export async function countListingsBySeller(sellerId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .in("status", ["published", "trading"]);
  return count ?? 0;
}
