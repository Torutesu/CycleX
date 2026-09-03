"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 長い本文を途中で畳む。
 *
 * 説明は2000文字まで書けるため、長い出品ではその下の情報
 * (通報の導線や他の商品)まで延々とスクロールすることになる。
 * 収まる長さのときはボタンを出さない。
 */
export function ExpandableText({
  text,
  /** 畳んだときに見せる行数 */
  lines = 10,
  className,
}: {
  text: string;
  lines?: number;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // 折り返しは幅で変わるので、画面幅の変化にも追従させる
    const check = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    check();

    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, lines]);

  return (
    <div className={className}>
      <p
        ref={ref}
        className={cn("whitespace-pre-wrap text-sm leading-relaxed", !expanded && "overflow-hidden")}
        style={expanded ? undefined : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines }}
      >
        {text}
      </p>

      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary"
        >
          {expanded ? "閉じる" : "続きを読む"}
          <ChevronDown
            className={cn("size-4 transition-transform", expanded && "rotate-180")}
            aria-hidden
          />
        </button>
      )}
    </div>
  );
}
