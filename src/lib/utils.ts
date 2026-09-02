import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  }).format(date);
}

/**
 * オープンリダイレクトを防ぐため、同一オリジン内の相対パスのみを許可する。
 * 不正な値が渡された場合は fallback を返す。
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  // "//evil.com" や "/\evil.com" のようなプロトコル相対 URL を弾く
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
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
