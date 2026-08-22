import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, PackageOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { listingImageUrl } from "@/lib/images";
import { formatPrice, formatDate, cn } from "@/lib/utils";
import { LISTING_STATUSES, labelOf, type ListingStatus } from "@/lib/constants";
import { ListingRowActions } from "@/features/listing/components/listing-row-actions";

export const metadata: Metadata = { title: "出品した商品" };

const TABS = [
  { value: "published", label: "公開中" },
  { value: "draft", label: "下書き" },
  { value: "trading", label: "取引中" },
  { value: "sold", label: "売却済" },
  { value: "withdrawn", label: "取下げ" },
  { value: "suspended", label: "非公開" },
] as const;

function isValidTab(value: string | undefined): value is (typeof TABS)[number]["value"] {
  return TABS.some((tab) => tab.value === value);
}

export default async function MyListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser("/mypage/listings");
  const { status } = await searchParams;
  const activeTab = isValidTab(status) ? status : "published";

  const supabase = await createClient();

  // タブごとの件数(バッジ表示用)
  const { data: allRows } = await supabase
    .from("listings")
    .select("id, status, title, price, created_at, published_at, listing_images(path, position)")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const rows = allRows ?? [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }

  const visible = rows.filter((row) => row.status === activeTab);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link
        href="/mypage"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        マイページ
      </Link>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">出品した商品</h1>
        <Button asChild size="sm" className="h-11">
          <Link href="/sell">出品する</Link>
        </Button>
      </div>

      {/* 横スクロール可能なタブ(スマホで6タブが収まらないため) */}
      <nav className="-mx-4 mt-5 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          {TABS.map((tab) => {
            const count = counts.get(tab.value) ?? 0;
            const active = tab.value === activeTab;
            return (
              <li key={tab.value}>
                <Link
                  href={`/mypage/listings?status=${tab.value}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                  <span className="tabular-nums opacity-80">{count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {visible.length === 0 ? (
        <div className="mt-10 flex flex-col items-center py-10 text-center">
          <PackageOpen className="size-10 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm text-muted-foreground">
            {labelOf(LISTING_STATUSES, activeTab)}の商品はありません。
          </p>
          {activeTab === "published" && (
            <Button asChild className="mt-5 h-11">
              <Link href="/sell">はじめて出品する</Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="mt-5 divide-y overflow-hidden rounded-xl border bg-card">
          {visible.map((row) => {
            const thumbnail = [...(row.listing_images ?? [])].sort(
              (a, b) => a.position - b.position,
            )[0];
            const editable = row.status === "draft" || row.status === "published";

            return (
              <li key={row.id} className="flex items-center gap-3 p-3">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                  {thumbnail ? (
                    <Image
                      src={listingImageUrl(thumbnail.path, { width: 160 })}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                      画像なし
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {editable ? (
                    <Link
                      href={`/sell/${row.id}/edit`}
                      className="line-clamp-2 text-sm font-medium hover:underline"
                    >
                      {row.title || "無題の下書き"}
                    </Link>
                  ) : (
                    <Link
                      href={`/items/${row.id}`}
                      className="line-clamp-2 text-sm font-medium hover:underline"
                    >
                      {row.title || "無題"}
                    </Link>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">{formatPrice(row.price)}</span>
                    <span>{formatDate(row.published_at ?? row.created_at)}</span>
                  </div>
                  {row.status === "suspended" && (
                    <Badge variant="destructive" className="mt-1.5">
                      運営により非公開
                    </Badge>
                  )}
                </div>

                <ListingRowActions
                  listingId={row.id}
                  status={row.status as ListingStatus}
                  title={row.title}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
