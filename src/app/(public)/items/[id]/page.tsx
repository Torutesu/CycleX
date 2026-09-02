import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { MapPin, Pencil } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RatingStars } from "@/components/rating-stars";
import { ImageSlider } from "@/components/listing/image-slider";
import { FavoriteButton } from "@/components/listing/favorite-button";
import { ListingGrid } from "@/components/listing/listing-grid";
import { getListingDetail } from "@/features/listing/queries";
import { getListingsBySeller } from "@/features/search/queries";
import { getRatingSummary } from "@/features/profile/queries";
import { isFavorited } from "@/features/favorite/queries";
import { findThreadByListing } from "@/features/message/queries";
import { AskSellerButton } from "@/features/message/components/ask-seller-button";
import { ReportDialog } from "@/features/report/components/report-dialog";
import { canPurchase } from "@/features/listing/rules";
import { getCurrentUser } from "@/lib/session";
import { avatarImageUrl, listingImageUrl } from "@/lib/images";
import { formatPrice, formatDate } from "@/lib/utils";
import {
  CATEGORIES,
  COMPONENTS,
  CONDITIONS,
  DELIVERY_METHODS,
  FRAME_SIZES,
  MILEAGES,
  PARTS_SUBCATEGORIES,
  PREFECTURES,
  isBikeCategory,
  labelOf,
} from "@/lib/constants";

/**
 * このルートには loading.tsx を置かない。
 *
 * loading.tsx があると本文の先頭が先に流れ出し、metadata もそれに合わせて
 * ストリーミングされる。そうなると応答は 200 で始まってしまい、
 * あとから notFound() しても状態コードを 404 に変えられない。
 * 売り切れ・取下げで消える商品が多く、検索エンジンから見て
 * 「存在するページ」が積み上がるのは避けたいので、待って 404 を返す。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListingDetail(id);
  // ここで打ち切らないと、head を書き出したあとに本体で notFound() することになり、
  // 応答が 200 のまま「見つかりません」の画面を返す(検索エンジンから見ると
  // 存在するページ)。売り切れや取下げで消える商品が多いので、必ず 404 にする。
  if (!listing) notFound();

  // 「ブランド + モデル名」で探されることが多いので、タイトルに含める
  const identity = [listing.brandName, listing.modelName].filter(Boolean).join(" ");
  const title =
    identity && !listing.title.includes(identity) ? `${listing.title}(${identity})` : listing.title;

  const description =
    listing.description?.replace(/\s+/g, " ").trim().slice(0, 120) ??
    `${formatPrice(listing.price)}で出品中の${labelOf(CATEGORIES, listing.category) ?? "商品"}です。`;

  // 下書き・取下げ・運営非表示の商品は検索結果に載せない
  const indexable = listing.status === "published" || listing.status === "trading";

  return {
    title,
    description,
    alternates: { canonical: `/items/${listing.id}` },
    robots: indexable ? undefined : { index: false, follow: false },
    openGraph: {
      type: "website",
      title,
      description,
      url: `/items/${listing.id}`,
      images: listing.imagePaths[0] ? [listingImageUrl(listing.imagePaths[0])] : undefined,
    },
  };
}

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [listing, user] = await Promise.all([getListingDetail(id), getCurrentUser()]);

  if (!listing) notFound();

  const isOwner = user?.id === listing.sellerId;
  const [favorited, ratingSummary, otherListings, existingThreadId] = await Promise.all([
    isFavorited(user?.id ?? null, listing.id),
    listing.seller
      ? getRatingSummary(listing.seller.id)
      : Promise.resolve({ average: null, count: 0 }),
    getListingsBySeller(listing.sellerId, { excludeId: listing.id, limit: 6 }),
    user && !isOwner ? findThreadByListing(listing.id, user.id) : Promise.resolve(null),
  ]);

  const purchasable = canPurchase(listing.status);
  const showBikeSpecs = isBikeCategory(listing.category);
  const avatarSrc = avatarImageUrl(listing.seller?.avatarUrl);

  const specs: { label: string; value: string | null }[] = [
    { label: "カテゴリ", value: labelOf(CATEGORIES, listing.category) },
    {
      label: "パーツの種類",
      value:
        listing.category === "parts"
          ? labelOf(PARTS_SUBCATEGORIES, listing.partsSubcategory)
          : null,
    },
    { label: "ブランド", value: listing.brandName },
    { label: "モデル名", value: listing.modelName },
    { label: "年式", value: listing.modelYear ? `${listing.modelYear}年` : null },
    {
      label: "フレームサイズ",
      value: showBikeSpecs
        ? [
            labelOf(FRAME_SIZES, listing.frameSize),
            listing.frameSizeCm ? `${listing.frameSizeCm}cm` : null,
          ]
            .filter(Boolean)
            .join(" / ") || null
        : null,
    },
    {
      label: "コンポーネント",
      value:
        [labelOf(COMPONENTS, listing.component), listing.componentNote]
          .filter(Boolean)
          .join(" / ") || null,
    },
    { label: "走行距離の目安", value: showBikeSpecs ? labelOf(MILEAGES, listing.mileage) : null },
    { label: "コンディション", value: labelOf(CONDITIONS, listing.condition) },
    { label: "受渡方法", value: labelOf(DELIVERY_METHODS, listing.deliveryMethod) },
    {
      label: listing.deliveryMethod === "in_person" ? "受渡地域" : "発送元",
      value: labelOf(PREFECTURES, listing.meetupPref ?? listing.shippingFromPref),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 pb-32 md:pb-8">
      {listing.status === "suspended" && (
        <div className="mb-4">
          <Badge variant="destructive">この商品は運営により非公開になっています</Badge>
          {/* 理由は出品者にだけ。閲覧者に見せる情報ではない */}
          {isOwner && listing.suspendedReason && (
            <p className="mt-1.5 text-sm text-destructive">理由: {listing.suspendedReason}</p>
          )}
        </div>
      )}
      {listing.status === "draft" && (
        <Badge variant="secondary" className="mb-4">
          下書き(自分だけに表示されています)
        </Badge>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        {/* 画像。PC では列幅いっぱいだと正方形が 750px 近くなり、
            1枚見るのに画面を丸ごと使ってしまうので上限を設ける */}
        <div className="lg:mx-auto lg:w-full lg:max-w-[560px]">
          <ImageSlider paths={listing.imagePaths} title={listing.title} />
        </div>

        {/* 情報 */}
        <div className="mt-6 lg:mt-0">
          <h1 className="text-lg font-bold leading-snug md:text-xl">{listing.title}</h1>

          <p className="mt-3 text-2xl font-bold tabular-nums">{formatPrice(listing.price)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {listing.deliveryMethod === "shipping" ? "送料込み・税込" : "税込"}
          </p>

          {/* PC 用アクション(スマホは画面下部に固定) */}
          <div className="mt-5 hidden space-y-3 lg:block">
            <PrimaryAction
              listingId={listing.id}
              status={listing.status}
              isOwner={isOwner}
              purchasable={purchasable}
            />
            {!isOwner && (
              <>
                <FavoriteButton
                  listingId={listing.id}
                  favorited={favorited}
                  count={listing.favoritesCount}
                  isLoggedIn={Boolean(user)}
                  variant="full"
                  className="w-full"
                />
                <AskSellerButton
                  listingId={listing.id}
                  sellerName={listing.seller?.displayName ?? "出品者"}
                  isLoggedIn={Boolean(user)}
                  existingThreadId={existingThreadId}
                  className="h-11 w-full"
                />
              </>
            )}
          </div>

          <Separator className="my-6" />

          {/* 出品者情報 */}
          {listing.seller && (
            <section>
              <h2 className="mb-3 text-sm font-semibold">出品者</h2>
              <Link
                href={`/users/${listing.seller.id}`}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/40"
              >
                {avatarSrc ? (
                  <Image
                    src={avatarSrc}
                    alt=""
                    width={48}
                    height={48}
                    className="size-12 rounded-full object-cover"
                  />
                ) : (
                  <Avatar className="size-12">
                    <AvatarFallback>{listing.seller.displayName.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{listing.seller.displayName}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <RatingStars value={ratingSummary.average} />
                      {ratingSummary.count > 0 ? (
                        <span className="tabular-nums">
                          {ratingSummary.average?.toFixed(1)}({ratingSummary.count})
                        </span>
                      ) : (
                        <span>評価なし</span>
                      )}
                    </span>
                    {listing.seller.prefecture && (
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="size-3" aria-hidden />
                        {labelOf(PREFECTURES, listing.seller.prefecture)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </section>
          )}
        </div>
      </div>

      {/* スペック表 */}
      <section className="mt-8 lg:max-w-2xl">
        <h2 className="text-base font-semibold">商品の詳細</h2>
        <dl className="mt-3 divide-y rounded-lg border">
          {specs
            .filter((spec) => spec.value)
            .map((spec) => (
              // ラベル列は最長の「走行距離の目安」に合わせて固定し、
              // 語の途中で折り返さないよう break-keep を効かせる
              <div
                key={spec.label}
                className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-2.5 text-sm sm:grid-cols-[8rem_1fr]"
              >
                <dt className="break-keep text-muted-foreground">{spec.label}</dt>
                <dd className="min-w-0">{spec.value}</dd>
              </div>
            ))}
        </dl>
      </section>

      {/* 説明 */}
      {listing.description && (
        <section className="mt-8 lg:max-w-2xl">
          <h2 className="text-base font-semibold">商品の説明</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{listing.description}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            出品日 {formatDate(listing.publishedAt ?? listing.updatedAt)}
          </p>
        </section>
      )}

      {!isOwner && (
        <div className="mt-8">
          <ReportDialog
            targetType="listing"
            targetId={listing.id}
            isLoggedIn={Boolean(user)}
            returnTo={`/items/${listing.id}`}
          />
        </div>
      )}

      {/* 同じ出品者の商品 */}
      {otherListings.length > 0 && (
        <section className="mt-12">
          <h2 className="text-base font-semibold">この出品者の他の商品</h2>
          <ListingGrid listings={otherListings} isLoggedIn={Boolean(user)} className="mt-4" />
        </section>
      )}

      {/* スマホ用の固定アクションバー(タブバーの上に重ねる) */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          {!isOwner && (
            <>
              <FavoriteButton
                listingId={listing.id}
                favorited={favorited}
                isLoggedIn={Boolean(user)}
                className="shrink-0 border"
              />
              <AskSellerButton
                listingId={listing.id}
                sellerName={listing.seller?.displayName ?? "出品者"}
                isLoggedIn={Boolean(user)}
                existingThreadId={existingThreadId}
                iconOnly
                className="size-11 shrink-0"
              />
            </>
          )}
          <div className="min-w-0 flex-1">
            <PrimaryAction
              listingId={listing.id}
              status={listing.status}
              isOwner={isOwner}
              purchasable={purchasable}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** 状態と閲覧者の役割で主ボタンを切り替える(FR-05) */
function PrimaryAction({
  listingId,
  status,
  isOwner,
  purchasable,
}: {
  listingId: string;
  status: string;
  isOwner: boolean;
  purchasable: boolean;
}) {
  if (isOwner) {
    return (
      <Button asChild className="h-12 w-full">
        <Link href={`/sell/${listingId}/edit`}>
          <Pencil className="size-4" aria-hidden />
          編集する
        </Link>
      </Button>
    );
  }

  if (status === "trading") {
    return (
      <Button disabled className="h-12 w-full">
        取引中
      </Button>
    );
  }

  if (status === "sold") {
    return (
      <Button disabled className="h-12 w-full">
        SOLD
      </Button>
    );
  }

  if (!purchasable) {
    return (
      <Button disabled className="h-12 w-full">
        購入できません
      </Button>
    );
  }

  return (
    <Button asChild className="h-12 w-full">
      <Link href={`/items/${listingId}/purchase`}>購入手続きへ</Link>
    </Button>
  );
}
