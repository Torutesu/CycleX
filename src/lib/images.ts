/**
 * Supabase Storage の画像 URL を組み立てる。
 *
 * サムネイル生成は行わず、Storage の画像変換エンドポイント(`render/image`)で
 * 必要なサイズを都度配信する(ADR #5)。
 */

const LISTING_BUCKET = "listing-images";
const AVATAR_BUCKET = "avatars";

function storageBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません");
  return url.replace(/\/$/, "");
}

type TransformOptions = {
  /** 出力幅(px) */
  width?: number;
  /** 出力高さ(px) */
  height?: number;
  /** リサイズ方式 */
  resize?: "cover" | "contain" | "fill";
  /** 画質(20〜100) */
  quality?: number;
};

function buildUrl(bucket: string, path: string, options: TransformOptions): string {
  const hasTransform = Boolean(options.width || options.height);
  const kind = hasTransform ? "render/image" : "object";
  const url = new URL(`${storageBaseUrl()}/storage/v1/${kind}/public/${bucket}/${path}`);

  if (options.width) url.searchParams.set("width", String(options.width));
  if (options.height) url.searchParams.set("height", String(options.height));
  if (options.resize) url.searchParams.set("resize", options.resize);
  if (hasTransform) url.searchParams.set("quality", String(options.quality ?? 75));

  return url.toString();
}

/** 商品画像の URL。一覧は 600px、詳細は 1200px を標準とする。 */
export function listingImageUrl(path: string, options: TransformOptions = {}): string {
  return buildUrl(LISTING_BUCKET, path, options);
}

/** プロフィールアイコンの URL。既定は 160px の正方形。 */
export function avatarImageUrl(path: string | null | undefined, size = 160): string | null {
  if (!path) return null;
  // Google ログイン等で外部 URL がそのまま入っている場合はそのまま返す
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return buildUrl(AVATAR_BUCKET, path, { width: size, height: size, resize: "cover" });
}

export const IMAGE_BUCKETS = {
  listing: LISTING_BUCKET,
  avatar: AVATAR_BUCKET,
} as const;
