import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listTransactions } from "@/features/admin/queries";
import { cancelTransaction } from "@/features/admin/actions";
import { AdminFilters } from "@/features/admin/components/admin-filters";
import { ReasonDialog } from "@/features/admin/components/admin-actions";
import {
  AdminEmpty,
  AdminHeader,
  AdminPagination,
  AdminTableShell,
} from "@/features/admin/components/admin-table";
import { isCancellable } from "@/features/admin/rules";
import { formatDate, formatPrice } from "@/lib/utils";
import { TRANSACTION_STATUSES, labelOf, type TransactionStatus } from "@/lib/constants";

export const metadata: Metadata = { title: "取引管理" };

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const result = await listTransactions({
    query: params.q,
    status: params.status,
    from: params.from,
    to: params.to,
    page,
  });

  return (
    <>
      <AdminHeader
        title="取引管理"
        description="取引の確認と、トラブル時のキャンセル操作を行います。返金は Stripe ダッシュボードで別途実施してください。"
      />

      <AdminFilters
        basePath="/admin/transactions"
        searchPlaceholder="商品タイトルで検索"
        searchValue={params.q ?? ""}
        filters={[
          {
            name: "status",
            label: "ステータス",
            options: TRANSACTION_STATUSES,
            value: params.status ?? "",
          },
        ]}
        dateRange={{ from: params.from ?? "", to: params.to ?? "" }}
      />

      {result.items.length === 0 ? (
        <AdminEmpty message="該当する取引はありません。" />
      ) : (
        <AdminTableShell>
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">商品</th>
              <th className="px-4 py-2.5 font-medium">購入者</th>
              <th className="px-4 py-2.5 font-medium">出品者</th>
              <th className="px-4 py-2.5 text-right font-medium">金額</th>
              <th className="px-4 py-2.5 font-medium">ステータス</th>
              <th className="px-4 py-2.5 font-medium">Stripe</th>
              <th className="px-4 py-2.5 font-medium">日時</th>
              <th className="px-4 py-2.5 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {result.items.map((tx) => {
              const cancellable = isCancellable(tx.status as TransactionStatus);

              return (
                <tr key={tx.id} className="hover:bg-accent/30">
                  <td className="px-4 py-2.5">
                    {tx.listing ? (
                      <Link
                        href={`/items/${tx.listing.id}`}
                        className="line-clamp-1 max-w-56 font-medium text-primary hover:underline"
                      >
                        {tx.listing.title}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">(削除された商品)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {tx.buyer ? (
                      <Link
                        href={`/admin/users/${tx.buyer.id}`}
                        className="text-muted-foreground hover:underline"
                      >
                        {tx.buyer.displayName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {tx.seller ? (
                      <Link
                        href={`/admin/users/${tx.seller.id}`}
                        className="text-muted-foreground hover:underline"
                      >
                        {tx.seller.displayName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatPrice(tx.price)}</td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={
                        tx.status === "canceled"
                          ? "destructive"
                          : tx.status === "completed"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {labelOf(TRANSACTION_STATUSES, tx.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {/* 決済 ID は Stripe ダッシュボードでの照合に使う */}
                    <code className="block max-w-40 truncate text-xs text-muted-foreground">
                      {tx.stripePaymentIntentId ?? tx.stripeSessionId ?? "—"}
                    </code>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {formatDate(tx.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    {cancellable ? (
                      <ReasonDialog
                        trigger="キャンセル"
                        title="この取引をキャンセルしますか?"
                        description="取引をキャンセル状態にし、商品が取引中であれば販売中に戻します。双方にメールで通知されます。"
                        reasonLabel="キャンセル理由"
                        reasonRequired
                        hidden={{ transactionId: tx.id }}
                        action={cancelTransaction}
                        successMessage="取引をキャンセルしました"
                        warning="返金はこの操作では行われません。必要な場合は Stripe ダッシュボードから別途実施してください。"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </AdminTableShell>
      )}

      <AdminPagination
        basePath="/admin/transactions"
        searchParams={params}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}
