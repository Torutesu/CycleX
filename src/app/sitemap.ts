import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl } from "@/lib/utils";

/**
 * サイトマップ(S3-1)。
 *
 * 公開中・取引中の商品と、静的ページを載せる。売却済みは載せない。
 * 件数が増えても1ファイルに収まるよう上限を設ける(sitemap.xml の上限は5万件)。
 */
const MAX_LISTINGS = 5000;

// ビルド時に DB へ繋がないよう動的にし、商品一覧だけを 1 時間キャッシュする
export const dynamic = "force-dynamic";

const getListingEntries = unstable_cache(
  async () => {
    const { data, error } = await createAdminClient()
      .from("listings")
      .select("id, updated_at")
      .in("status", ["published", "trading"])
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(MAX_LISTINGS);
    if (error) {
      console.error("[sitemap] 商品の取得に失敗しました", error);
      return null;
    }
    return data ?? [];
  },
  ["sitemap-listings"],
  { revalidate: 3600, tags: ["listings"] },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/search"), changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/tokushoho"), changeFrequency: "yearly", priority: 0.3 },
  ];

  const data = await getListingEntries();
  // サイトマップの失敗でページ全体を落とさない。静的ページだけ返す。
  if (data === null) return staticEntries;

  const listingEntries: MetadataRoute.Sitemap = data.map((listing) => ({
    url: absoluteUrl(`/items/${listing.id}`),
    lastModified: new Date(listing.updated_at),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticEntries, ...listingEntries];
}
