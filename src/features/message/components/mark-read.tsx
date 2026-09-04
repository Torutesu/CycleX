"use client";

import { useEffect } from "react";
import { markThreadReadAction } from "@/features/message/actions";

/**
 * スレッドを開いたら既読にする。
 *
 * 描画中に書き込むとヘッダーとタブの未読バッジが古いまま残るため、
 * 表示後にクライアントから呼ぶ。未読が無いときは通信しない。
 */
export function MarkThreadRead({
  threadId,
  hasUnread,
  upTo,
}: {
  threadId: string;
  hasUnread: boolean;
  /** 画面に出した最後のメッセージの日時。ここまでを既読にする */
  upTo?: string;
}) {
  useEffect(() => {
    if (!hasUnread) return;
    // 失敗しても表示には影響しない。次に開いたときに既読になる
    void markThreadReadAction(threadId, upTo).catch(() => {});
  }, [threadId, hasUnread, upTo]);

  return null;
}
