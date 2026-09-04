"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageOff, Expand } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ImageSliderProps = {
  /** 表示する画像の URL。非表示中の商品は署名付き URL になる(解決はサーバー側) */
  urls: string[];
  title: string;
};

/** 送っている最中のスクロールを、指で動かしたものと取り違えないための猶予 */
const SCROLL_SETTLE_MS = 800;

/**
 * FR-05: 画像スライダー。
 * スマホは CSS scroll-snap によるスワイプ、PC は矢印とサムネイルで操作する。
 */
export function ImageSlider({ urls, title }: ImageSliderProps) {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // 拡大表示でのスワイプ判定(横スクロールは無いので開始位置だけ控える)
  const touchStartX = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // 送っている途中の行き先。着くまではスクロールからの更新を受け付けない
  const pendingRef = useRef<{ index: number; until: number } | null>(null);

  const scrollTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(urls.length - 1, next));
      setIndex(clamped);
      const track = trackRef.current;
      if (!track) return;
      pendingRef.current = { index: clamped, until: Date.now() + SCROLL_SETTLE_MS };
      track.scrollTo({ left: track.clientWidth * clamped, behavior: "smooth" });
    },
    [urls.length],
  );

  // 拡大表示中の左右キー。
  // 端まで進むとボタンが押せなくなり、そこにあったフォーカスが外れるので、
  // ダイアログではなく画面全体で受ける。
  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") scrollTo(index + 1);
      if (event.key === "ArrowLeft") scrollTo(index - 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded, index, scrollTo]);

  if (urls.length === 0) {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted text-muted-foreground">
        <ImageOff className="size-8" aria-hidden />
        <span className="text-sm">画像なし</span>
      </div>
    );
  }

  /**
   * スクロール位置から今の枚数を割り出す。
   * ボタンで送っている間は途中の位置が何度も流れてきて、そのたびに番号が
   * 元へ戻ってしまうので、行き先に着くまでは読み飛ばす。
   */
  function onTrackScroll(track: HTMLDivElement) {
    const current = Math.round(track.scrollLeft / track.clientWidth);
    const pending = pendingRef.current;
    if (pending) {
      // 指で触られるなどして行き先に着けないこともあるため、時間でも打ち切る
      if (current !== pending.index && Date.now() < pending.until) return;
      pendingRef.current = null;
    }
    if (current !== index) setIndex(current);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={(event) => onTrackScroll(event.currentTarget)}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {urls.map((path, i) => (
            <div key={path} className="relative aspect-square w-full shrink-0 snap-center bg-muted">
              <Image
                src={path}
                alt={`${title} の画像 ${i + 1}`}
                fill
                sizes="(max-width: 1024px) 100vw, 560px"
                className="object-contain"
                priority={i === 0}
              />
            </div>
          ))}
        </div>

        {/* 拡大表示 */}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="画像を拡大表示"
          className="absolute bottom-2 right-2 flex size-11 items-center justify-center rounded-full bg-background/85 backdrop-blur hover:bg-background"
        >
          <Expand className="size-4" aria-hidden />
        </button>

        {/* PC 用の前後ボタン */}
        {urls.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => scrollTo(index - 1)}
              disabled={index === 0}
              aria-label="前の画像"
              className="absolute left-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 backdrop-blur disabled:opacity-30 md:flex"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => scrollTo(index + 1)}
              disabled={index === urls.length - 1}
              aria-label="次の画像"
              className="absolute right-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 backdrop-blur disabled:opacity-30 md:flex"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>

            <span className="absolute left-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-xs tabular-nums backdrop-blur">
              {index + 1} / {urls.length}
            </span>
          </>
        )}
      </div>

      {/* サムネイルストリップ */}
      {urls.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {urls.map((path, i) => (
            <li key={path}>
              <button
                type="button"
                onClick={() => scrollTo(i)}
                aria-label={`${i + 1}枚目を表示`}
                aria-current={i === index}
                className={cn(
                  "relative size-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                  i === index ? "border-primary" : "border-transparent opacity-70",
                )}
              >
                <Image src={path} alt="" fill sizes="64px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 拡大表示。ここでも写真を送れないと、閉じて送って開き直すことになる */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-4xl p-2 sm:p-4">
          <DialogTitle className="sr-only">{title} の画像</DialogTitle>
          <div
            className="relative aspect-square w-full touch-pan-y"
            onTouchStart={(event) => {
              touchStartX.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const start = touchStartX.current;
              touchStartX.current = null;
              if (start === null) return;
              const delta = (event.changedTouches[0]?.clientX ?? start) - start;
              if (Math.abs(delta) < 40) return;
              scrollTo(delta < 0 ? index + 1 : index - 1);
            }}
          >
            <Image
              src={urls[index]}
              alt={`${title} の画像 ${index + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
            />

            {urls.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => scrollTo(index - 1)}
                  disabled={index === 0}
                  aria-label="前の画像"
                  className="absolute left-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 backdrop-blur transition-opacity disabled:opacity-30"
                >
                  <ChevronLeft className="size-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => scrollTo(index + 1)}
                  disabled={index === urls.length - 1}
                  aria-label="次の画像"
                  className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 backdrop-blur transition-opacity disabled:opacity-30"
                >
                  <ChevronRight className="size-5" aria-hidden />
                </button>
                {/* 送った先が画像だけでは伝わらないので、読み上げにも流す */}
                <span
                  aria-live="polite"
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/85 px-2.5 py-0.5 text-xs tabular-nums backdrop-blur"
                >
                  {index + 1} / {urls.length}
                </span>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
