import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/utils";

/**
 * サイトマップ(S3-1)。
 *
 * 公開中・取引中の商品と、静的ページを載せる。売却済みは載せない。
 * 件数が増えても1ファイルに収まるよう上限を設ける(sitemap.xml の上限は5万件)。
 */
const MAX_LISTINGS = 5000;

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/search"), changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/tokushoho"), changeFrequency: "yearly", priority: 0.3 },
  ];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select("id, updated_at")
    .in("status", ["published", "trading"])
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(MAX_LISTINGS);

  if (error) {
    // サイトマップの失敗でページ全体を落とさない。静的ページだけ返す。
    console.error("[sitemap] 商品の取得に失敗しました", error);
    return staticEntries;
  }

  const listingEntries: MetadataRoute.Sitemap = (data ?? []).map((listing) => ({
    url: absoluteUrl(`/items/${listing.id}`),
    lastModified: new Date(listing.updated_at),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticEntries, ...listingEntries];
}
