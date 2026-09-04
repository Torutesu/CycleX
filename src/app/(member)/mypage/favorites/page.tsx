import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, HeartOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListingGrid } from "@/components/listing/listing-grid";
import { requireUser } from "@/lib/session";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { getFavoriteListings } from "@/features/favorite/queries";

export const metadata: Metadata = { title: "お気に入り" };

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser("/mypage/favorites");
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { items: listings, total, totalPages } = await getFavoriteListings(user.id, page);
  const favoritedIds = new Set(listings.map((listing) => listing.id));
  const unavailable = listings.filter(
    (listing) => !["published", "trading", "sold"].includes(listing.status),
  ).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link
        href="/mypage"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        マイページ
      </Link>

      <h1 className="text-xl font-bold">
        お気に入り
        <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
          {total}件
        </span>
      </h1>
      {unavailable > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          取下げ・非公開になった商品は薄く表示しています。出品者が再公開すると再び開けます。
        </p>
      )}

      {total === 0 ? (
        <EmptyState
          icon={HeartOff}
          title="お気に入りはまだありません"
          description="気になる商品のハートを押すと、ここにまとまります。値下げや売り切れも追いやすくなります。"
          action={
            <Button asChild className="h-11">
              <Link href="/search">商品をさがす</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ListingGrid
            listings={listings}
            favoritedIds={favoritedIds}
            isLoggedIn
            currentUserId={user.id}
            className="mt-5"
          />
          <Pagination
            page={page}
            totalPages={totalPages}
            buildHref={(p: number) =>
              p === 1 ? "/mypage/favorites" : `/mypage/favorites?page=${p}`
            }
          />
        </>
      )}
    </div>
  );
}
