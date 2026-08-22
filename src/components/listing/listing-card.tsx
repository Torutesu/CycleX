import Link from "next/link";
import Image from "next/image";
import { ImageOff, MapPin } from "lucide-react";
import { FavoriteButton } from "@/components/listing/favorite-button";
import { listingImageUrl } from "@/lib/images";
import { formatPrice, cn } from "@/lib/utils";
import { labelOf, PREFECTURES, isBikeCategory } from "@/lib/constants";
import { listingBadge } from "@/features/listing/rules";
import type { ListingCardData } from "@/features/search/queries";

type ListingCardProps = {
  listing: ListingCardData;
  favorited?: boolean;
  isLoggedIn?: boolean;
  /** 自分の出品にはお気に入りボタンを出さない */
  isOwn?: boolean;
};

/** FR-04-5: 一覧に並ぶ商品カード。スマホ2列/PC4列のグリッド内で使う。 */
export function ListingCard({
  listing,
  favorited = false,
  isLoggedIn = false,
  isOwn = false,
}: ListingCardProps) {
  const badge = listingBadge(listing.status);
  const region = labelOf(PREFECTURES, listing.shippingFromPref ?? listing.meetupPref);
  const showFrameSize = isBikeCategory(listing.category) && listing.frameSize;

  return (
    <article className="group relative">
      <Link href={`/items/${listing.id}`} className="block">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
          {listing.thumbnailPath ? (
            <Image
              src={listingImageUrl(listing.thumbnailPath, { width: 600 })}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition-transform group-hover:scale-105"
              unoptimized
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <ImageOff className="size-6" aria-hidden />
              <span className="text-xs">画像なし</span>
            </div>
          )}

          {badge && (
            <span
              className={cn(
                "absolute left-2 top-2 rounded px-2 py-0.5 text-xs font-semibold",
                badge.tone === "sold" && "bg-foreground text-background",
                badge.tone === "trading" && "bg-amber-500 text-white",
                badge.tone === "muted" && "bg-muted-foreground text-background",
              )}
            >
              {badge.label}
            </span>
          )}
        </div>

        <div className="mt-2 space-y-1">
          <h3 className="line-clamp-2 text-sm leading-snug">{listing.title}</h3>
          <p className="font-bold tabular-nums">{formatPrice(listing.price)}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {listing.brandName && <span className="truncate">{listing.brandName}</span>}
            {showFrameSize && <span>サイズ {listing.frameSize}</span>}
            {region && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="size-3" aria-hidden />
                {region}
              </span>
            )}
          </div>
        </div>
      </Link>

      {!isOwn && (
        <FavoriteButton
          listingId={listing.id}
          favorited={favorited}
          isLoggedIn={isLoggedIn}
          className="absolute right-1 top-1"
        />
      )}
    </article>
  );
}
