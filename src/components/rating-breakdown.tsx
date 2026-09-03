import type { RatingSummary } from "@/features/profile/rating";
import { cn } from "@/lib/utils";

const STARS = [5, 4, 3, 2, 1] as const;

/** これ未満なら内訳を出さない。1〜2件の棒グラフは場所の割に何も語らない */
export const MIN_REVIEWS_FOR_BREAKDOWN = 3;

/**
 * 星ごとの件数。
 * 平均だけだと「4.5」が全員4〜5なのか、5が多くて低評価が混じるのか区別できない。
 */
export function RatingBreakdown({
  summary,
  className,
}: {
  summary: RatingSummary;
  className?: string;
}) {
  if (summary.count < MIN_REVIEWS_FOR_BREAKDOWN) return null;

  return (
    <div className={cn("space-y-1", className)}>
      {STARS.map((star) => {
        const count = summary.breakdown[star];
        const ratio = (count / summary.count) * 100;
        return (
          <div key={star} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-7 shrink-0 tabular-nums">★{star}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-amber-400"
                style={{ width: `${ratio}%` }}
              />
            </span>
            <span className="w-6 shrink-0 text-right tabular-nums">{count}</span>
          </div>
        );
      })}
    </div>
  );
}
