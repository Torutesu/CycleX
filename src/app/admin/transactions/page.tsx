import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { countRefundPending, listTransactions } from "@/features/admin/queries";
import { cancelTransaction } from "@/features/admin/actions";
import { AdminFilters } from "@/features/admin/components/admin-filters";
import { ReasonDialog } from "@/features/admin/components/admin-actions";
import {
  AdminEmpty,
  AdminHeader,
  AdminPagination,
  AdminTableShell,
} from "@/features/admin/components/admin-table";
import { isCancellable, needsRefund } from "@/features/admin/rules";
import { formatDate, formatPrice } from "@/lib/utils";
import { TRANSACTION_STATUSES, labelOf, type TransactionStatus } from "@/lib/constants";

/**
 * 入金済みのままキャンセルされた取引を絞り込むためのフィルタ。
 * 返金 API は対象外(別紙1 3.(4))のため、この一覧を見て Stripe ダッシュボードで手動対応する。
 */
const REFUND_FILTER_OPTIONS = [{ value: "pending", label: "返金対応が必要" }] as const;

/** 止まっている取引の抽出(C-3)。催促や代理操作の対象を洗い出す */
const STALE_FILTER_OPTIONS = [
  { value: "paid7", label: "支払い後 7 日以上 発送なし" },
  { value: "shipped14", label: "発送後 14 日以上 受取なし" },
] as const;

export const metadata: Metadata = { title: "取引管理" };

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const [result, refundPending] = await Promise.all([
    listTransactions({
      query: params.q,
      status: params.status,
      refund: params.refund,
      stale: params.stale,
      from: params.from,
      to: params.to,
      page,
    }),
    countRefundPending(),
  ]);

  return (
    <>
      <AdminHeader
        title="取引管理"
        description="取引の確認と、トラブル時のキャンセル操作を行います。返金は Stripe ダッシュボードで別途実施してください。"
      />

      {refundPending > 0 && params.refund !== "pending" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
          <span>
            入金済みのままキャンセルされた取引が{" "}
            <strong className="tabular-nums">{refundPending}</strong> 件あります。 Stripe
            ダッシュボードから返金してください。
          </span>
          <Link
            href="/admin/transactions?refund=pending"
            className="ml-auto font-medium text-primary underline-offset-4 hover:underline"
          >
            対象を表示
          </Link>
        </div>
      )}

      <AdminFilters
        basePath="/admin/transactions"
        searchPlaceholder="商品名・当事者の表示名・メールで検索"
        searchValue={params.q ?? ""}
        filters={[
          {
            name: "status",
            label: "ステータス",
            options: TRANSACTION_STATUSES,
            value: params.status ?? "",
          },
          {
            name: "refund",
            label: "返金対応",
            options: REFUND_FILTER_OPTIONS,
            value: params.refund ?? "",
          },
          {
            name: "stale",
            label: "停滞",
            options: STALE_FILTER_OPTIONS,
            value: params.stale ?? "",
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
              const refundNeeded = needsRefund(
                tx.status as TransactionStatus,
                tx.paidAt,
                tx.refundedAt,
              );

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
                    {refundNeeded && (
                      <Badge variant="destructive" className="ml-1.5">
                        要返金
                      </Badge>
                    )}
                    {tx.refundedAt && (
                      <Badge variant="secondary" className="ml-1.5">
                        返金済み
                      </Badge>
                    )}
                    {tx.disputedAt && (
                      <Badge variant="destructive" className="ml-1.5">
                        チャージバック
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {/* 決済 ID は Stripe ダッシュボードでの照合に使う */}
                    <code
                      className="block max-w-40 truncate text-xs text-muted-foreground"
                      title={tx.stripePaymentIntentId ?? tx.stripeSessionId ?? undefined}
                    >
                      {tx.stripePaymentIntentId ?? tx.stripeSessionId ?? "—"}
                    </code>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {formatDate(tx.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/transactions/${tx.id}`}
                      className="mr-2 inline-flex min-h-11 items-center text-sm text-primary hover:underline"
                    >
                      詳細
                    </Link>
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
