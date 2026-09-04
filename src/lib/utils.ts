import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 表示に使う時間帯。
 *
 * 対象は日本国内のみだが、実行環境の時計は UTC のことが多い(Vercel など)。
 * 指定しないと出品日や取引日時が9時間ずれて出るため、ここで固定する。
 */
const TIME_ZONE = "Asia/Tokyo";

/** 価格を「¥12,345」形式で整形する */
export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "—";
  return `¥${price.toLocaleString("ja-JP")}`;
}

/** 日時を「2026/08/22 14:30」形式で整形する */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** 日付を「2026/08/22」形式で整形する */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

/**
 * 日本時間での「YYYY-MM-DD」。日別の集計に使う。
 *
 * 日本標準時は夏時間を持たず常に UTC+9 なので、固定のずらしで足りる。
 * これを使わずに UTC の日付で数えると、朝9時までの出来事が
 * 前日に積まれてしまう。
 */
export function jstDateKey(value: string | Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 日本時間の「今日」の始まり */
export function startOfJstDay(value: string | Date = new Date()): Date {
  return new Date(`${jstDateKey(value)}T00:00:00+09:00`);
}

/** 日本時間での今年 */
export function jstYear(value: string | Date = new Date()): number {
  return Number(jstDateKey(value).slice(0, 4));
}

/** 時刻を「14:30」形式で整形する */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** ログイン後の戻り先として使わないパス(ループや無意味な遷移を避ける) */
const REDIRECT_DENY_PREFIXES = ["/login", "/signup", "/auth/", "/reset-password", "/verify-email"];

/**
 * オープンリダイレクトを防ぐため、同一オリジン内の相対パスのみを許可する。
 * 不正な値が渡された場合は fallback を返す。
 *
 * 文字列の先頭だけを見る判定では `"/\t/evil.com"`(`/%09/evil.com`)のような
 * 制御文字入りの値をすり抜けられ、ブラウザは制御文字を捨てて `//evil.com` と解釈する。
 * 制御文字・空白を弾いたうえで、URL として解決しても origin が変わらないことを確かめる。
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  // 制御文字・空白(タブ・改行・NUL など)を含む値は信用しない
  if (/[\u0000-\u001f\u007f\s]/.test(next)) return fallback;
  // "//evil.com" や "/\evil.com" のようなプロトコル相対 URL を弾く
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;

  let url: URL;
  try {
    url = new URL(next, "http://redirect.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://redirect.invalid") return fallback;

  // 認証画面へ戻すとループする(ログイン済みで /login?next=/login など)
  if (REDIRECT_DENY_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return fallback;

  return url.pathname + url.search + url.hash;
}

/**
 * アプリの基準 URL。
 *
 * 環境変数は「未設定」と「空文字で登録されている」の両方が起こりうる。
 * `??` は空文字を拾ってしまい `new URL("")` が投げるため、trim して判定する。
 * NEXT_PUBLIC_APP_URL が無いときは Vercel が自動で入れる本番ドメインに委ねる。
 */
export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

/** アプリの絶対 URL を組み立てる(メール本文・OAuth リダイレクト用) */
export function absoluteUrl(path = "/"): string {
  return new URL(path, appBaseUrl()).toString();
}

/**
 * 「3日前」のような相対表記。
 *
 * 出品の鮮度は購入判断に効くが、絶対日付だと一覧を眺めながら
 * 頭の中で引き算することになる。1週間を超えたら日付に戻す
 * (「48日前」は具体的に見えて実は分かりにくい)。
 */
export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "昨日";
  if (days < 7) return `${days}日前`;

  return formatDate(date);
}
