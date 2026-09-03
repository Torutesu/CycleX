import Link from "next/link";
import Image from "next/image";
import { ChevronRight, MapPin, Package } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RatingStars } from "@/components/rating-stars";
import { RatingBreakdown } from "@/components/rating-breakdown";
import { avatarImageUrl } from "@/lib/images";
import { labelOf, PREFECTURES } from "@/lib/constants";
import { formatDate, timeAgo } from "@/lib/utils";
import type { PublicReview, RatingSummary } from "@/features/profile/queries";

type SellerCardProps = {
  seller: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    prefecture: string | null;
    createdAt?: string | null;
  };
  summary: RatingSummary;
  /** 直近の評価。無ければ出さない */
  reviews?: PublicReview[];
  /** 公開中の出品数 */
  listingCount?: number;
};

/**
 * 誰から買うのかを判断するための出品者情報。
 *
 * 平均点だけでは「4.5」が全員4〜5なのか低評価が混じるのか分からない。
 * 星ごとの件数と直近のコメント、他に何を出しているかまで見せる。
 */
export function SellerCard({ seller, summary, reviews = [], listingCount }: SellerCardProps) {
  const avatarSrc = avatarImageUrl(seller.avatarUrl);
  const prefecture = labelOf(PREFECTURES, seller.prefecture);
  const withComment = reviews.filter((review) => review.comment?.trim()).slice(0, 2);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Link
        href={`/users/${seller.id}`}
        className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/40"
      >
        {avatarSrc ? (
          <Image
            src={avatarSrc}
            alt=""
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-full object-cover"
          />
        ) : (
          <Avatar className="size-12 shrink-0">
            <AvatarFallback>{seller.displayName.slice(0, 1)}</AvatarFallback>
          </Avatar>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{seller.displayName}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <RatingStars value={summary.average} />
              {summary.count > 0 ? (
                <span className="tabular-nums">
                  {summary.average?.toFixed(1)}({summary.count})
                </span>
              ) : (
                <span>評価なし</span>
              )}
            </span>
            {prefecture && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="size-3" aria-hidden />
                {prefecture}
              </span>
            )}
          </div>
          {seller.createdAt && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatDate(seller.createdAt)}から利用
            </p>
          )}
        </div>

        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>

      <RatingBreakdown summary={summary} className="border-t px-3 py-3" />

      {/* 直近のコメント */}
      {withComment.length > 0 && (
        <ul className="space-y-3 border-t px-3 py-3">
          {withComment.map((review) => (
            <li key={review.id} className="text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <RatingStars value={review.rating} />
                <span>{review.reviewer?.displayName ?? "退会したユーザー"}</span>
                <span className="ml-auto">{timeAgo(review.createdAt)}</span>
              </div>
              <p className="mt-1 line-clamp-2 leading-relaxed">{review.comment}</p>
            </li>
          ))}
        </ul>
      )}

      {typeof listingCount === "number" && listingCount > 0 && (
        <Link
          href={`/users/${seller.id}`}
          className="flex min-h-11 items-center gap-2 border-t px-3 text-xs font-medium text-primary transition-colors hover:bg-accent/40"
        >
          <Package className="size-3.5" aria-hidden />
          この出品者の商品を見る
          <span className="tabular-nums">({listingCount}件)</span>
          <ChevronRight className="ml-auto size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}
