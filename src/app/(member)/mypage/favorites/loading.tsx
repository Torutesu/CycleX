import { ListingGridSkeleton, PageHeadingSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <PageHeadingSkeleton />
      <ListingGridSkeleton count={6} />
    </div>
  );
}
