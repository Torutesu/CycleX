import { Skeleton } from "@/components/ui/skeleton";

export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      <div className="lg:flex lg:gap-8">
        <aside className="hidden w-64 shrink-0 space-y-4 lg:block">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </aside>

        <div className="min-w-0 flex-1">
          <Skeleton className="h-6 w-48" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-11 w-28" />
            <Skeleton className="ml-auto h-11 w-40" />
          </div>
          <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-20" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
