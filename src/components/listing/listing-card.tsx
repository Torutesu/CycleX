import Link from "next/link";
import Image from "next/image";
import { Heart, ImageOff, MapPin } from "lucide-react";
import { FavoriteButton } from "@/components/listing/favorite-button";
import { hasVisibleImage, listingImageUrl } from "@/lib/images";
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
  /**
   * 詳細を開けない商品(取下げ・非表示・下書き)でもお気に入りボタンを出す。
   *
   * お気に入り一覧で使う。ここで出さないと、出品者が取下げた商品が
   * 件数に残ったまま片付けられなくなる(監査 M-1)。
   */
  allowUnfavorite?: boolean;
};

/** FR-04-5: 一覧に並ぶ商品カード。スマホ2列/PC4列のグリッド内で使う。 */
export function ListingCard({
  listing,
  favorited = false,
  isLoggedIn = false,
  isOwn = false,
  priority = false,
  allowUnfavorite = false,
}: ListingCardProps) {
  const badge = listingBadge(listing.status);
  // 対面は受渡地域、配送は発送元(商品詳細と同じ規則)
  const region = labelOf(
    PREFECTURES,
    listing.deliveryMethod === "in_person"
      ? (listing.meetupPref ?? listing.shippingFromPref)
      : (listing.shippingFromPref ?? listing.meetupPref),
  );
  const showFrameSize = isBikeCategory(listing.category) && listing.frameSize;
  const posted = timeAgo(listing.publishedAt);
  // 取下げ・非表示・下書きは本人以外に詳細を見せられない(お気に入り一覧で「その旨」を示す)
  const reachable = ["published", "trading", "sold"].includes(listing.status);
  // 地色の上に載る「面」として組む。以前は透明な塊で、
  // どこまでが 1 つの商品なのかが並びの間隔だけで示されていた
  const bodyClass = cn(
    "block overflow-hidden rounded-xl border bg-card shadow-xs transition-all duration-150",
    reachable ? "hover:border-primary/30 hover:shadow-sm active:scale-[0.98]" : "opacity-70",
  );

  const body = (
    <>
      <div className="relative aspect-square overflow-hidden bg-muted">
        {listing.thumbnailPath && hasVisibleImage(listing.status) ? (
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
            <span className="text-xs">
              {hasVisibleImage(listing.status) ? "画像なし" : "画像は非公開"}
            </span>
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
              badge.tone === "trading" && "bg-warning text-warning-foreground",
              badge.tone === "muted" && "bg-muted-foreground text-background",
            )}
          >
            {badge.label}
          </span>
        )}
      </div>

      {/*
        添える情報を絞る。
        タイトルには出品者が「Bianchi OLTRE XR4 2017年モデル Sサイズ」のように
        ブランド・モデル・年式・サイズを書くので、その下に同じ内容を並べると
        2 列のスマホ幅では「Bian…」まで削れた灰色の文字列になり、価格より目立っていた。
        カードに残すのは、タイトルからは読み取れない「どこから・いつ・どれだけ見られたか」。
        フレームサイズだけはタイトルに無いこともあり、選ぶ決め手になるので残す。
      */}
      <div className="space-y-1 px-2.5 pb-2.5 pt-2">
        {/*
          2 行分の高さを常に確保する。1 行のタイトルが混ざると
          同じ行のカードだけ背が低くなり、並びの下端がそろわない
        */}
        <h3 className="line-clamp-2 min-h-[2.375rem] break-phrase text-sm leading-snug">
          {listing.title}
        </h3>
        <p className="text-[0.9375rem] font-bold leading-tight tabular-nums">
          {formatPrice(listing.price)}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {showFrameSize && (
            <span className="shrink-0 rounded border px-1 font-medium leading-4">
              {listing.frameSize}
            </span>
          )}
          {region && (
            <span className="inline-flex min-w-0 items-center gap-0.5">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{region}</span>
            </span>
          )}
          {posted && <span className="shrink-0">{posted}</span>}
          {listing.favoritesCount > 0 && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-0.5">
              <Heart className="size-3" aria-hidden />
              <span className="tabular-nums">{listing.favoritesCount}</span>
            </span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <article className="group relative">
      {/*
        詳細を開けない商品は div で包む。
        `<div href>` は不正な HTML になるので、href はリンクのときだけ渡す。
      */}
      {reachable ? (
        <Link href={`/items/${listing.id}`} className={bodyClass}>
          {body}
        </Link>
      ) : (
        <div className={bodyClass} aria-disabled>
          {body}
        </div>
      )}

      {!isOwn && (reachable || allowUnfavorite) && (
        <FavoriteButton
          listingId={listing.id}
          favorited={favorited}
          listingTitle={listing.title}
          isLoggedIn={isLoggedIn}
          className="absolute right-1.5 top-1.5"
        />
      )}
    </article>
  );
}
