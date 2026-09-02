import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, HeartOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListingGrid } from "@/components/listing/listing-grid";
import { requireUser } from "@/lib/session";
import { EmptyState } from "@/components/common/empty-state";
import { createClient } from "@/lib/supabase/server";
import { toCard } from "@/features/search/queries";
import type { ListingCardData } from "@/features/search/queries";

export const metadata: Metadata = { title: "お気に入り" };

export default async function FavoritesPage() {
  const user = await requireUser("/mypage/favorites");

  const supabase = await createClient();
  const { data } = await supabase
    .from("favorites")
    .select(
      `listing_id, created_at,
       listings!inner(id, title, price, status, category, frame_size, shipping_from_pref,
         meetup_pref, favorites_count, published_at, listing_images(path, position), brands(name))`,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    // MVP の想定規模に対して十分な上限。超える場合はページングを検討する
    .limit(100);

  const listings: ListingCardData[] = (data ?? [])
    .map((row) => row.listings)
    .filter(Boolean)
    .map((listing) => toCard(listing as unknown as Parameters<typeof toCard>[0]));

  const favoritedIds = new Set(listings.map((listing) => listing.id));

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
          {listings.length}件
        </span>
      </h1>

      {listings.length === 0 ? (
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
        <ListingGrid
          listings={listings}
          favoritedIds={favoritedIds}
          isLoggedIn
          className="mt-5"
        />
      )}
    </div>
  );
}
