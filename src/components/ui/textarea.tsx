"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 入力に合わせて高さが伸びる複数行入力。
 *
 * `field-sizing: content` は Chrome 系にしか無く、Safari と Firefox では
 * rows={1} の入力欄が1行のまま伸びない。日本の利用者は iPhone が多いため、
 * メッセージの入力欄が1行の窓のままになると実害が大きい。
 * 対応していないブラウザでは、こちらで高さを合わせる。
 */
function supportsFieldSizing(): boolean {
  return typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content") === true;
}

function Textarea({
  className,
  onInput,
  ref,
  ...props
}: React.ComponentProps<"textarea">) {
  const innerRef = React.useRef<HTMLTextAreaElement>(null);

  const fitToContent = React.useCallback(() => {
    const element = innerRef.current;
    if (!element || supportsFieldSizing()) return;
    // 一度縮めてから測らないと、消したときに縮まない
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, []);

  // 送信後に空へ戻したときなど、外から値が変わったときも合わせ直す
  React.useEffect(fitToContent, [fitToContent, props.value]);

  return (
    <textarea
      data-slot="textarea"
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      onInput={(event) => {
        fitToContent();
        onInput?.(event);
      }}
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
