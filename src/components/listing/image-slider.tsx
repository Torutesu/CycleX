"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageOff, Expand } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { listingImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

type ImageSliderProps = {
  paths: string[];
  title: string;
};

/**
 * FR-05: 画像スライダー。
 * スマホは CSS scroll-snap によるスワイプ、PC は矢印とサムネイルで操作する。
 */
export function ImageSlider({ paths, title }: ImageSliderProps) {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  if (paths.length === 0) {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted text-muted-foreground">
        <ImageOff className="size-8" aria-hidden />
        <span className="text-sm">画像なし</span>
      </div>
    );
  }

  function scrollTo(next: number) {
    const clamped = Math.max(0, Math.min(paths.length - 1, next));
    setIndex(clamped);
    const track = trackRef.current;
    if (track) {
      track.scrollTo({ left: track.clientWidth * clamped, behavior: "smooth" });
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={(event) => {
            const track = event.currentTarget;
            const current = Math.round(track.scrollLeft / track.clientWidth);
            if (current !== index) setIndex(current);
          }}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {paths.map((path, i) => (
            <div key={path} className="relative aspect-square w-full shrink-0 snap-center bg-muted">
              <Image
                src={listingImageUrl(path)}
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
        {paths.length > 1 && (
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
              disabled={index === paths.length - 1}
              aria-label="次の画像"
              className="absolute right-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 backdrop-blur disabled:opacity-30 md:flex"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>

            <span className="absolute left-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-xs tabular-nums backdrop-blur">
              {index + 1} / {paths.length}
            </span>
          </>
        )}
      </div>

      {/* サムネイルストリップ */}
      {paths.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {paths.map((path, i) => (
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
                <Image
                  src={listingImageUrl(path)}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-4xl p-2 sm:p-4">
          <DialogTitle className="sr-only">{title} の画像</DialogTitle>
          <div className="relative aspect-square w-full">
            <Image
              src={listingImageUrl(paths[index])}
              alt={`${title} の画像 ${index + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
