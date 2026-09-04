import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { listListings } from "@/features/admin/queries";
import { suspendListing, unsuspendListing } from "@/features/admin/actions";
import { AdminFilters } from "@/features/admin/components/admin-filters";
import { ReasonDialog, ConfirmButton } from "@/features/admin/components/admin-actions";
import {
  AdminEmpty,
  AdminHeader,
  AdminPagination,
  AdminTableShell,
} from "@/features/admin/components/admin-table";
import { listingImageUrl } from "@/lib/images";
import { formatDate, formatPrice } from "@/lib/utils";
import { CATEGORIES, LISTING_STATUSES, labelOf } from "@/lib/constants";

export const metadata: Metadata = { title: "出品管理" };

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const result = await listListings({
    query: params.q,
    status: params.status,
    category: params.category,
    id: params.id,
    page,
  });

  return (
    <>
      <AdminHeader title="出品管理" description="出品の検索・確認と、非表示化の操作を行います。" />

      <AdminFilters
        basePath="/admin/listings"
        searchPlaceholder="タイトル・説明・モデル名で検索"
        searchValue={params.q ?? ""}
        filters={[
          { name: "status", label: "状態", options: LISTING_STATUSES, value: params.status ?? "" },
          {
            name: "category",
            label: "カテゴリ",
            options: CATEGORIES,
            value: params.category ?? "",
          },
        ]}
      />

      {result.items.length === 0 ? (
        <AdminEmpty message="該当する出品はありません。" />
      ) : (
        <AdminTableShell>
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">商品</th>
              <th className="px-4 py-2.5 font-medium">出品者</th>
              <th className="px-4 py-2.5 text-right font-medium">価格</th>
              <th className="px-4 py-2.5 font-medium">状態</th>
              <th className="px-4 py-2.5 text-right font-medium">通報</th>
              <th className="px-4 py-2.5 font-medium">出品日</th>
              <th className="px-4 py-2.5 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {result.items.map((listing) => (
              <tr key={listing.id} className="hover:bg-accent/30">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {listing.thumbnailPath ? (
                      <Image
                        src={listingImageUrl(listing.thumbnailPath)}
                        alt=""
                        width={36}
                        height={36}
                        className="size-9 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded bg-muted text-[9px] text-muted-foreground">
                        なし
                      </span>
                    )}
                    <Link
                      href={`/items/${listing.id}`}
                      className="line-clamp-1 max-w-64 font-medium text-primary hover:underline"
                    >
                      {listing.title || "(無題)"}
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {listing.seller ? (
                    <Link
                      href={`/admin/users/${listing.seller.id}`}
                      className="text-muted-foreground hover:underline"
                    >
                      {listing.seller.displayName}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatPrice(listing.price)}
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={listing.status === "suspended" ? "destructive" : "outline"}>
                    {labelOf(LISTING_STATUSES, listing.status)}
                  </Badge>
                  {listing.status === "suspended" && listing.suspendedReason && (
                    <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                      理由: {listing.suspendedReason}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {listing.reportCount > 0 ? (
                    <span className="font-medium text-destructive">{listing.reportCount}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                  {formatDate(listing.publishedAt ?? listing.createdAt)}
                </td>
                <td className="px-4 py-2.5">
                  {listing.status === "suspended" ? (
                    <ConfirmButton
                      label="非表示を解除"
                      confirmTitle="非表示を解除しますか?"
                      confirmDescription="利用停止に伴って非表示になった商品は元の状態へ戻ります。運営が個別に非表示にした商品は「取下げ中」に戻り、公開するかは出品者が決めます。"
                      onConfirm={async () => {
                        "use server";
                        return unsuspendListing(listing.id);
                      }}
                      successMessage="非表示を解除しました"
                    />
                  ) : listing.status === "trading" || listing.status === "sold" ? (
                    <span className="text-xs text-muted-foreground">取引中のため操作不可</span>
                  ) : (
                    <ReasonDialog
                      trigger="非表示にする"
                      title="この商品を非表示にしますか?"
                      description="検索・一覧・商品ページから除外され、出品者には「運営により非公開」と表示されます。"
                      reasonLabel="理由(出品者に表示されます)"
                      reasonRequired
                      hidden={{ listingId: listing.id }}
                      action={suspendListing}
                      successMessage="非表示にしました"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTableShell>
      )}

      <AdminPagination
        basePath="/admin/listings"
        searchParams={params}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}
