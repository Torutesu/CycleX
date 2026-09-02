import { ListingCard } from "@/components/listing/listing-card";
import type { ListingCardData } from "@/features/search/queries";
import { cn } from "@/lib/utils";

type ListingGridProps = {
  listings: ListingCardData[];
  favoritedIds?: Set<string>;
  isLoggedIn?: boolean;
  className?: string;
};

/**
 * スマホ2列 → タブレット3列 → PC4列(FR-04-5)。
 *
 * 一覧の最初の画像が LCP になるので、先頭の数枚だけ先に読み込む。
 * 全部を eager にすると回線を食い合って逆に遅くなる。
 */
const EAGER_COUNT = 4;

export function ListingGrid({
  listings,
  favoritedIds,
  isLoggedIn = false,
  className,
}: ListingGridProps) {
  return (
    <ul className={cn("grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-4", className)}>
      {listings.map((listing, index) => (
        <li key={listing.id}>
          <ListingCard
            listing={listing}
            favorited={favoritedIds?.has(listing.id) ?? false}
            isLoggedIn={isLoggedIn}
            priority={index < EAGER_COUNT}
          />
        </li>
      ))}
    </ul>
  );
}
