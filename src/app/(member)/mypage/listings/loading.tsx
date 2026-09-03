import { ListRowsSkeleton, PageHeadingSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <PageHeadingSkeleton withTabs />
      <ListRowsSkeleton />
    </div>
  );
}
