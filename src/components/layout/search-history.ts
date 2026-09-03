"use client";

/**
 * 検索キーワードの履歴。
 *
 * 同じ条件で何度も探す人が多いので、打ち直さずに戻れるようにする。
 * 端末の中だけに置き、サーバーへは送らない。
 */
const KEY = "cyclex:search-history";
const MAX = 8;

export function readHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").slice(0, MAX);
  } catch {
    // 読めない設定でも検索そのものは使える
    return [];
  }
}

export function pushHistory(keyword: string): string[] {
  const value = keyword.trim();
  if (!value) return readHistory();

  const next = [value, ...readHistory().filter((item) => item !== value)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても検索は続けられる
  }
  return next;
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 消せなくても実害はない
  }
}
