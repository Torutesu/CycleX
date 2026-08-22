import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type RatingStarsProps = {
  /** 1〜5。null のときは空の星を表示する */
  value: number | null;
  size?: "sm" | "md";
  className?: string;
};

/** 評価の★表示(FR-10)。小数は四捨五入して塗り分ける。 */
export function RatingStars({ value, size = "sm", className }: RatingStarsProps) {
  const filled = value === null ? 0 : Math.round(value);
  const starClass = size === "sm" ? "size-3.5" : "size-5";

  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={value === null ? "評価なし" : `5段階中${value}`}
    >
      {[1, 2, 3, 4, 5].map((index) => (
        <Star
          key={index}
          className={cn(
            starClass,
            index <= filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}
