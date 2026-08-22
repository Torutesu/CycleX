"use client";

import { useEffect, useRef } from "react";

/**
 * スレッドを開いたとき、および新着が増えたときに最下部へスクロールする。
 * 表示位置の調整のみで状態は持たない。
 */
export function ScrollToBottom({ dependency }: { dependency: number }) {
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    anchorRef.current?.scrollIntoView({ block: "end" });
  }, [dependency]);

  return <div ref={anchorRef} aria-hidden />;
}
