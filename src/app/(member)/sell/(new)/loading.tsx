import { Skeleton } from "@/components/ui/skeleton";

/** 出品フォームの読み込み中 */
export default function SellLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <Skeleton className="h-7 w-32" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
    </div>
  );
}
