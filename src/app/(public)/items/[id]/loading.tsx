import { Skeleton } from "@/components/ui/skeleton";

export default function ItemLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <Skeleton className="aspect-square w-full rounded-lg" />
        <div className="mt-6 space-y-4 lg:mt-0">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
      <div className="mt-8 space-y-2 lg:max-w-2xl">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
