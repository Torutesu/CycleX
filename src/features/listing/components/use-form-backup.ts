"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

/**
 * 入力途中の内容をブラウザに退避しておく。
 *
 * 出品フォームは長く、スマホでは画面下のタブバーがすぐ隣にある。
 * 誤って別の画面へ移ると入力がすべて消えるため、
 * 打ちながら控えを取り、戻ってきたときに復元できるようにする。
 *
 * 保存先はその端末のブラウザのみで、サーバーへは送らない。
 * 保存できない設定(プライベートモード等)でもフォームは通常どおり動く。
 */
const PREFIX = "cyclex:listing-draft:";

/**
 * 控えの保存キー。利用者ごとに分ける。
 * 共有端末で別の人の入力内容が「前回の内容」として出ないようにするため。
 */
export function backupKey(scope: string, userId: string): string {
  return `${scope}:${userId}`;
}

/**
 * 控えを取ってよいか。
 *
 * 編集(id あり)はサーバー側に正が残っているので対象外。
 * 新規作成でも、下書き保存で id が付いた後は保存しない — 以前は控えに id が混じり、
 * 後日その控えを復元して公開すると、別の商品として入力した内容で
 * 保存済みの商品を上書きしていた。
 */
export function shouldBackup(
  defaultsId: string | null | undefined,
  currentId: string | null | undefined,
): boolean {
  return !defaultsId && !currentId;
}

/** 復元する内容から、商品を特定する情報を取り除く(古い控えに id が残っていても無視する) */
export function sanitizeBackup<T extends { id?: string | null }>(backup: T): T {
  return { ...backup, id: undefined };
}

/** この端末に残っている控えをすべて消す(ログアウト時) */
export function clearAllFormBackups(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
    candidates.clear();
    notify();
  } catch {
    // 消せなくても実害はない
  }
}

const listeners = new Set<() => void>();

/**
 * 復元候補として提示する内容。
 *
 * localStorage を毎回読むと、いま自分が打っている内容がそのまま
 * 「前回の入力」として出てしまう。フォームを開いた時点の値だけを
 * 候補として抱え、以降の保存では変えない。
 * 画面を離れるときに捨てるので、戻ってくれば新しい控えを読み直す。
 */
const candidates = new Map<string, string | null>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function candidateOf(storageKey: string): string | null {
  if (!candidates.has(storageKey)) {
    try {
      candidates.set(storageKey, window.localStorage.getItem(storageKey));
    } catch {
      // 読めなくてもフォームは使える
      candidates.set(storageKey, null);
    }
  }
  return candidates.get(storageKey) ?? null;
}

export function useFormBackup<T extends { id?: string | null }>(
  key: string,
  values: T,
  enabled: boolean,
) {
  const storageKey = `${PREFIX}${key}`;

  // サーバーでは常に null。クライアントで読み直すため、
  // 描画中に setState せずにハイドレーションのずれも起きない
  const stored = useSyncExternalStore(
    subscribe,
    useCallback(() => (enabled ? candidateOf(storageKey) : null), [enabled, storageKey]),
    () => null,
  );

  const backup = useMemo<T | null>(() => {
    if (!stored) return null;
    try {
      return sanitizeBackup(JSON.parse(stored) as T);
    } catch {
      return null;
    }
  }, [stored]);

  // 初回の描画で控えを上書きしないよう、1回描画してから保存を始める
  const armed = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (!armed.current) {
      armed.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(sanitizeBackup(values)));
      } catch {
        // 容量超過などは黙って諦める
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [enabled, storageKey, values]);

  // 画面を離れたら候補を捨てる。次に開いたときに読み直せるようにする
  useEffect(() => {
    return () => {
      candidates.delete(storageKey);
    };
  }, [storageKey]);

  const dismiss = useCallback(() => {
    candidates.set(storageKey, null);
    notify();
  }, [storageKey]);

  const clear = useCallback(() => {
    candidates.set(storageKey, null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // 消せなくても実害はない
    }
    notify();
  }, [storageKey]);

  return { backup, dismiss, clear };
}
