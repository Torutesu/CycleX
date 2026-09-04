import "server-only";

import { listingImageUrl } from "@/lib/images";
import { signedHiddenImageUrls } from "@/lib/storage";
import type { ListingStatus } from "@/lib/constants";

/**
 * 商品詳細に出す画像 URL を解決する。
 *
 * 運営が非表示にした商品の画像は非公開バケットへ退避しているため、公開 URL では出せない。
 * この画面に辿り着けるのは出品者本人と管理者だけなので、署名付き URL で見せる。
 */
export async function resolveListingImageUrls(
  paths: string[],
  status: ListingStatus,
): Promise<string[]> {
  if (paths.length === 0) return [];
  if (status !== "suspended") return paths.map(listingImageUrl);

  const signed = await signedHiddenImageUrls(paths);
  // 退避前の商品(この機能より前に非表示にしたもの)は公開バケットに残っている
  return signed.length > 0 ? signed : paths.map(listingImageUrl);
}
