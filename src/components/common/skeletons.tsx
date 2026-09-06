import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * 読み込み中の骨組み。
 *
 * 押した直後に何も変わらないと「効いていない」と感じて連打されるので、
 * 実際の並びと同じ形をすぐ出す。表示する数は画面に見える範囲に合わせる。
 */
export function ListingGridSkeleton({
  count = 8,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <ul className={cn("grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <li key={index} className="space-y-2">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </li>
      ))}
    </ul>
  );
}

/** 行が縦に並ぶ一覧(取引・やり取り・出品管理)の骨組み */
export function ListRowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {Array.from({ length: count }).map((_, index) => (
        <li key={index} className="flex items-center gap-3 p-3">
          <Skeleton className="size-14 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 画面上部の見出しぶんの骨組み */
export function PageHeadingSkeleton({ withTabs = false }: { withTabs?: boolean }) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      {withTabs && (
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-24 rounded-full" />
          ))}
        </div>
      )}
    </div>
  );
}
