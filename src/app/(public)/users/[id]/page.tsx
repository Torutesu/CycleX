import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RatingStars } from "@/components/rating-stars";
import { ListingGrid } from "@/components/listing/listing-grid";
import { getListingsBySeller } from "@/features/search/queries";
import { getFavoritedIds } from "@/features/favorite/queries";
import { getCurrentUser } from "@/lib/session";
import { avatarImageUrl } from "@/lib/images";
import { formatDate } from "@/lib/utils";
import { labelOf, PREFECTURES } from "@/lib/constants";
import {
  getPublicProfile,
  getPublishedReviews,
  getRatingSummary,
} from "@/features/profile/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  return { title: profile ? `${profile.displayName} さんのプロフィール` : "プロフィール" };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [profile, viewer] = await Promise.all([getPublicProfile(id), getCurrentUser()]);

  if (!profile) notFound();
  // 利用停止ユーザーのページは管理者以外に見せない(FR-11)
  if (profile.status === "suspended" && viewer?.role !== "admin") notFound();

  const [summary, reviews, sellerListings] = await Promise.all([
    getRatingSummary(id),
    getPublishedReviews(id),
    getListingsBySeller(id, { limit: 12 }),
  ]);

  const favoritedIds = await getFavoritedIds(
    viewer?.id ?? null,
    sellerListings.map((listing) => listing.id),
  );

  const avatarSrc = avatarImageUrl(profile.avatarUrl, 128);
  const prefecture = labelOf(PREFECTURES, profile.prefecture);
  const withdrawn = profile.status === "withdrawn";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <section className="flex items-start gap-4">
        {avatarSrc && !withdrawn ? (
          <Image
            src={avatarSrc}
            alt=""
            width={72}
            height={72}
            className="size-18 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <Avatar className="size-18">
            <AvatarFallback className="text-xl">
              {profile.displayName.slice(0, 1) || "U"}
            </AvatarFallback>
          </Avatar>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">{profile.displayName}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <RatingStars value={summary.average} />
              {summary.count > 0 ? (
                <span className="ml-1 tabular-nums">
                  {summary.average?.toFixed(1)}({summary.count}件)
                </span>
              ) : (
                <span className="ml-1">評価なし</span>
              )}
            </span>
            {prefecture && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {prefecture}
              </span>
            )}
            <span>登録日 {formatDate(profile.createdAt)}</span>
          </div>
        </div>
      </section>

      {profile.bio && !withdrawn && (
        <section className="mt-6">
          <h2 className="text-sm font-medium">自己紹介</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {profile.bio}
          </p>
        </section>
      )}

      {sellerListings.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium">出品中の商品</h2>
          <ListingGrid
            listings={sellerListings}
            favoritedIds={favoritedIds}
            isLoggedIn={Boolean(viewer)}
            className="mt-3"
          />
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium">
          受け取った評価
          {summary.count > 0 && <span className="ml-1 text-muted-foreground">({summary.count})</span>}
        </h2>
        {reviews.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">まだ評価はありません。</p>
        ) : (
          <ul className="mt-3 divide-y rounded-xl border bg-card">
            {reviews.map((review) => (
              <li key={review.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <RatingStars value={review.rating} />
                  <span className="text-sm font-medium">
                    {review.reviewer?.displayName ?? "退会済みユーザー"}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDate(review.createdAt)}
                  </span>
                </div>
                {review.comment && (
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">
                    {review.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
