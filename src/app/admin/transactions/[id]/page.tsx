import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAuditLogs, getTransactionDetail } from "@/features/admin/queries";
import { cancelTransaction } from "@/features/admin/actions";
import { ReasonDialog } from "@/features/admin/components/admin-actions";
import { AdminHeader } from "@/features/admin/components/admin-table";
import { AuditLogList } from "@/features/admin/components/audit-log-list";
import { isCancellable, needsRefund } from "@/features/admin/rules";
import { describeCancelReason } from "@/features/transaction/state";
import { formatDateTime, formatPrice } from "@/lib/utils";
import {
  LISTING_STATUSES,
  TRANSACTION_STATUSES,
  labelOf,
  type TransactionStatus,
} from "@/lib/constants";

export const metadata: Metadata = { title: "取引の詳細" };

/** transaction_events の種別の表示名 */
const EVENT_LABELS: Record<string, string> = {
  created: "購入手続きを開始",
  paid: "支払い完了",
  shipped: "発送・受渡連絡",
  received: "受取確認",
  completed: "取引完了",
  canceled: "キャンセル",
  payment_after_cancel: "キャンセル後に入金(要返金)",
};

export default async function AdminTransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tx = await getTransactionDetail(id);
  if (!tx) notFound();

  const auditLogs = await getAuditLogs("transaction", id);
  const status = tx.status as TransactionStatus;
  const refundNeeded = needsRefund(status, tx.paidAt);

  const timeline: { label: string; at: string | null }[] = [
    { label: "購入手続き開始", at: tx.createdAt },
    { label: "支払い完了", at: tx.paidAt },
    { label: "発送・受渡連絡", at: tx.shippedAt },
    { label: "受取確認", at: tx.receivedAt },
    { label: "取引完了", at: tx.completedAt },
    { label: "キャンセル", at: tx.canceledAt },
  ];

  return (
    <>
      <Link
        href="/admin/transactions"
        className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        取引管理
      </Link>

      <AdminHeader
        title={tx.listing?.title ?? "(削除された商品)"}
        description={`取引 ID: ${tx.id}`}
        action={
          isCancellable(status) ? (
            <ReasonDialog
              trigger="キャンセル"
              title="この取引をキャンセルしますか?"
              description="取引をキャンセル状態にし、商品が取引中であれば販売中に戻します。双方にメールで通知されます。入力した理由は双方に送られます。"
              reasonLabel="キャンセル理由(双方に通知されます)"
              reasonRequired
              hidden={{ transactionId: tx.id }}
              action={cancelTransaction}
              successMessage="取引をキャンセルしました"
              warning="返金はこの操作では行われません。必要な場合は Stripe ダッシュボードから別途実施してください。"
            />
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-background p-4">
          <h2 className="mb-3 text-sm font-semibold">取引</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">ステータス</dt>
            <dd>
              <Badge
                variant={
                  status === "canceled"
                    ? "destructive"
                    : status === "completed"
                      ? "secondary"
                      : "outline"
                }
              >
                {labelOf(TRANSACTION_STATUSES, status)}
              </Badge>
              {refundNeeded && (
                <Badge variant="destructive" className="ml-1.5">
                  要返金
                </Badge>
              )}
            </dd>
            <dt className="text-muted-foreground">金額</dt>
            <dd className="tabular-nums">{formatPrice(tx.price)}</dd>
            <dt className="text-muted-foreground">商品</dt>
            <dd>
              {tx.listing ? (
                <>
                  <Link href={`/items/${tx.listing.id}`} className="text-primary hover:underline">
                    {tx.listing.title}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {labelOf(LISTING_STATUSES, tx.listing.status)}
                  </span>
                </>
              ) : (
                "(削除された商品)"
              )}
            </dd>
            <dt className="text-muted-foreground">購入者</dt>
            <dd>
              {tx.buyer ? (
                <Link href={`/admin/users/${tx.buyer.id}`} className="text-primary hover:underline">
                  {tx.buyer.displayName}
                  <span className="ml-1 text-xs text-muted-foreground">{tx.buyer.email}</span>
                </Link>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-muted-foreground">出品者</dt>
            <dd>
              {tx.seller ? (
                <Link
                  href={`/admin/users/${tx.seller.id}`}
                  className="text-primary hover:underline"
                >
                  {tx.seller.displayName}
                  <span className="ml-1 text-xs text-muted-foreground">{tx.seller.email}</span>
                </Link>
              ) : (
                "—"
              )}
            </dd>
            {tx.canceledReason && (
              <>
                <dt className="text-muted-foreground">キャンセル理由</dt>
                <dd>{describeCancelReason(tx.canceledReason)}</dd>
              </>
            )}
            {tx.shippingNote && (
              <>
                <dt className="text-muted-foreground">発送・受渡メモ</dt>
                <dd className="whitespace-pre-wrap">{tx.shippingNote}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="rounded-xl border bg-background p-4">
          <h2 className="mb-3 text-sm font-semibold">Stripe</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            ダッシュボードで照合・返金する際に使う ID。全文をそのままコピーできます。
          </p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">PaymentIntent</dt>
              <dd>
                <code className="break-all text-xs">{tx.stripePaymentIntentId ?? "—"}</code>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Checkout Session</dt>
              <dd>
                <code className="break-all text-xs">{tx.stripeSessionId ?? "—"}</code>
              </dd>
            </div>
          </dl>

          <h2 className="mb-3 mt-6 text-sm font-semibold">日時</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
            {timeline
              .filter((item) => item.at)
              .map((item) => (
                <div key={item.label} className="contents">
                  <dt className="text-muted-foreground">{item.label}</dt>
                  <dd className="tabular-nums">{formatDateTime(item.at!)}</dd>
                </div>
              ))}
          </dl>
        </section>
      </div>

      <section className="mt-4 rounded-xl border bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold">履歴(transaction_events)</h2>
        {tx.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">履歴はありません。</p>
        ) : (
          <ul className="divide-y text-sm">
            {tx.events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                <span className="w-40 shrink-0 tabular-nums text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                </span>
                <span className="font-medium">{EVENT_LABELS[event.event] ?? event.event}</span>
                <span className="text-muted-foreground">{event.actorName ?? "システム"}</span>
                {event.note && (
                  <span className="basis-full text-muted-foreground">
                    {describeCancelReason(event.note)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-xl border bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold">管理操作の履歴</h2>
        <AuditLogList logs={auditLogs} />
      </section>
    </>
  );
}
