/**
 * Supabase Storage の画像 URL を組み立てる。
 *
 * Storage の画像変換(`render/image`)は Supabase の有料プラン限定機能のため使わず、
 * 原本を公開 URL で返して next/image にリサイズと形式変換を任せる。
 * 呼び出し側は `sizes`(または width/height)を指定すること。
 */

const LISTING_BUCKET = "listing-images";
const AVATAR_BUCKET = "avatars";

function storageBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません");
  return url.replace(/\/$/, "");
}

function publicUrl(bucket: string, path: string): string {
  return `${storageBaseUrl()}/storage/v1/object/public/${bucket}/${encodeURI(path)}`;
}

/** 商品画像の公開 URL */
export function listingImageUrl(path: string): string {
  return publicUrl(LISTING_BUCKET, path);
}

/** プロフィールアイコンの公開 URL。外部 URL(Google 等)はそのまま返す。 */
export function avatarImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return publicUrl(AVATAR_BUCKET, path);
}

export const IMAGE_BUCKETS = {
  listing: LISTING_BUCKET,
  avatar: AVATAR_BUCKET,
} as const;
