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

/** 外部アイコン URL として許可するホスト(Google ログインのプロフィール画像) */
const ALLOWED_AVATAR_HOST = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//;

/**
 * プロフィールアイコンの公開 URL。
 *
 * 外部 URL は Google のプロフィール画像だけを通す。それ以外のホストは
 * next/image の許可リストに無く描画時に例外になる(そのユーザーが出てくる
 * 画面が全員に対して落ちる)ので、既定アイコンにフォールバックさせる。
 */
export function avatarImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return ALLOWED_AVATAR_HOST.test(path) ? path : null;
  }
  return publicUrl(AVATAR_BUCKET, path);
}

/**
 * 画像パスが指定ユーザーのフォルダ配下かを判定する。
 * Storage 側のポリシー(先頭フォルダ = 所有者 ID)と同じ規約をアプリ側でも検証する。
 */
export function isOwnedImagePath(path: string, userId: string): boolean {
  if (!path.startsWith(`${userId}/`)) return false;
  // 上位フォルダへ抜ける記法と、階層をまたぐパスは受け付けない
  const rest = path.slice(userId.length + 1);
  return rest.length > 0 && !rest.includes("/") && !rest.includes("..");
}

/**
 * 一覧・サムネイルで画像を出してよい状態か。
 *
 * 運営が非表示にした商品の画像は非公開バケットへ退避しているため、
 * 公開 URL では表示できない(署名付き URL を使う商品詳細だけが例外)。
 */
export function hasVisibleImage(status: string | null | undefined): boolean {
  return status !== "suspended";
}

export const IMAGE_BUCKETS = {
  listing: LISTING_BUCKET,
  avatar: AVATAR_BUCKET,
} as const;
