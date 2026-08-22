import { ListingCard } from "@/components/listing/listing-card";
import type { ListingCardData } from "@/features/search/queries";
import { cn } from "@/lib/utils";

type ListingGridProps = {
  listings: ListingCardData[];
  favoritedIds?: Set<string>;
  isLoggedIn?: boolean;
  className?: string;
};

/** スマホ2列 → タブレット3列 → PC4列(FR-04-5) */
export function ListingGrid({
  listings,
  favoritedIds,
  isLoggedIn = false,
  className,
}: ListingGridProps) {
  return (
    <ul className={cn("grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-4", className)}>
      {listings.map((listing) => (
        <li key={listing.id}>
          <ListingCard
            listing={listing}
            favorited={favoritedIds?.has(listing.id) ?? false}
            isLoggedIn={isLoggedIn}
          />
        </li>
      ))}
    </ul>
  );
}
