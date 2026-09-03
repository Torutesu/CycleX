"use client";

import { useEffect } from "react";
import { markThreadReadAction } from "@/features/message/actions";

/**
 * スレッドを開いたら既読にする。
 *
 * 描画中に書き込むとヘッダーとタブの未読バッジが古いまま残るため、
 * 表示後にクライアントから呼ぶ。未読が無いときは通信しない。
 */
export function MarkThreadRead({ threadId, hasUnread }: { threadId: string; hasUnread: boolean }) {
  useEffect(() => {
    if (!hasUnread) return;
    // 失敗しても表示には影響しない。次に開いたときに既読になる
    void markThreadReadAction(threadId).catch(() => {});
  }, [threadId, hasUnread]);

  return null;
}
