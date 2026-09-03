import Link from "next/link";
import Image from "next/image";
import { Heart, ImageOff, MapPin } from "lucide-react";
import { FavoriteButton } from "@/components/listing/favorite-button";
import { listingImageUrl } from "@/lib/images";
import { formatPrice, timeAgo, cn } from "@/lib/utils";
import { labelOf, PREFECTURES, isBikeCategory } from "@/lib/constants";
import { listingBadge } from "@/features/listing/rules";
import type { ListingCardData } from "@/features/search/queries";

type ListingCardProps = {
  listing: ListingCardData;
  favorited?: boolean;
  isLoggedIn?: boolean;
  /** 自分の出品にはお気に入りボタンを出さない */
  isOwn?: boolean;
  /** 一覧の先頭など、画面に最初から見えている画像を先に読み込む */
  priority?: boolean;
};

/** FR-04-5: 一覧に並ぶ商品カード。スマホ2列/PC4列のグリッド内で使う。 */
export function ListingCard({
  listing,
  favorited = false,
  isLoggedIn = false,
  isOwn = false,
  priority = false,
}: ListingCardProps) {
  const badge = listingBadge(listing.status);
  const region = labelOf(PREFECTURES, listing.shippingFromPref ?? listing.meetupPref);
  const showFrameSize = isBikeCategory(listing.category) && listing.frameSize;
  const posted = timeAgo(listing.publishedAt);

  return (
    <article className="group relative">
      <Link
        href={`/items/${listing.id}`}
        className="block transition-transform duration-150 active:scale-[0.98]"
      >
        <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
          {listing.thumbnailPath ? (
            <Image
              src={listingImageUrl(listing.thumbnailPath)}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              priority={priority}
              className="object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <ImageOff className="size-6" aria-hidden />
              <span className="text-xs">画像なし</span>
            </div>
          )}

          {/* 売れた商品を一覧で見分けられるよう、バッジではなく画像全体を覆う */}
          {badge && badge.tone === "sold" && (
            <div className="absolute inset-0 flex items-center justify-center bg-foreground/55">
              <span className="rounded-sm border-2 border-background px-3 py-1 text-sm font-bold tracking-wider text-background">
                SOLD
              </span>
            </div>
          )}

          {badge && badge.tone !== "sold" && (
            <span
              className={cn(
                "absolute left-2 top-2 rounded px-2 py-0.5 text-xs font-semibold",
                badge.tone === "trading" && "bg-amber-500 text-white",
                badge.tone === "muted" && "bg-muted-foreground text-background",
              )}
            >
              {badge.label}
            </span>
          )}
        </div>

        <div className="mt-2 space-y-1">
          <h3 className="line-clamp-2 break-phrase text-sm leading-snug">{listing.title}</h3>
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
          {/* 出品の新しさと注目度。中古品はこの2つで見比べられることが多い */}
          {(posted || listing.favoritesCount > 0) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {posted && <span>{posted}</span>}
              {listing.favoritesCount > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Heart className="size-3" aria-hidden />
                  <span className="tabular-nums">{listing.favoritesCount}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      {!isOwn && (
        <FavoriteButton
          listingId={listing.id}
          favorited={favorited}
          listingTitle={listing.title}
          isLoggedIn={isLoggedIn}
          className="absolute right-1 top-1"
        />
      )}
    </article>
  );
}
