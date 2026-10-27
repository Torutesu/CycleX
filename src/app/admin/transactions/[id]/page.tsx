import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ChevronLeft, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getTransactionDetail } from "@/features/admin/queries";
import { recordAdminAction } from "@/features/admin/audit";
import { AdminHeader } from "@/features/admin/components/admin-table";
import { needsRefund } from "@/features/admin/rules";
import { requireAdmin } from "@/lib/session";
import { formatDateTime, formatPrice, cn } from "@/lib/utils";
import {
  DELIVERY_METHODS,
  REPORT_STATUSES,
  TRANSACTION_STATUSES,
  labelOf,
  reportReasonLabel,
  type TransactionStatus,
} from "@/lib/constants";

export const metadata: Metadata = { title: "取引の詳細" };

/**
 * 取引の詳細と、購入者・出品者のメッセージ(閲覧のみ)。
 *
 * トラブルの申し出があったときに、運営が当事者間のやり取りを確かめるための画面。
 * 運営から書き込むことはできず、閲覧しても当事者の未読・既読は変わらない。
 * 個人情報(お届け先など)を含むため、誰がいつ見たかを操作記録に残す。
 */
export default async function AdminTransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireAdmin();
  const tx = await getTransactionDetail(id);
  if (!tx) notFound();

  after(() => recordAdminAction(admin.id, "view_messages", "transaction", tx.id));

  const refundNeeded = needsRefund(tx.status as TransactionStatus, tx.paidAt);
  // 購入前の質問と購入後のやり取りの境目。支払い前の取引は購入手続きを始めた時点で区切る
  const purchasedAt = tx.paidAt ?? tx.createdAt;
  const dividerIndex = tx.messages.findIndex((message) => message.createdAt >= purchasedAt);

  return (
    <>
      <Link
        href="/admin/transactions"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        取引管理
      </Link>

      <AdminHeader
        title={tx.listing.title}
        description={`取引 ID: ${tx.id}`}
        action={
          <div className="flex gap-1.5">
            <Badge variant={tx.status === "canceled" ? "destructive" : "outline"}>
              {labelOf(TRANSACTION_STATUSES, tx.status)}
            </Badge>
            {refundNeeded && <Badge variant="destructive">要返金</Badge>}
          </div>
        }
      />

      <section className="rounded-xl border bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold">取引の内容</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row
            label="商品"
            value={
              <Link href={`/items/${tx.listing.id}`} className="text-primary hover:underline">
                商品ページを開く
              </Link>
            }
          />
          <Row label="金額" value={formatPrice(tx.price)} />
          <Row
            label="購入者"
            value={
              tx.buyer ? (
                <Link href={`/admin/users/${tx.buyer.id}`} className="hover:underline">
                  {tx.buyer.displayName}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <Row
            label="出品者"
            value={
              tx.seller ? (
                <Link href={`/admin/users/${tx.seller.id}`} className="hover:underline">
                  {tx.seller.displayName}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <Row
            label="受渡方法"
            value={labelOf(DELIVERY_METHODS, tx.listing.deliveryMethod) ?? "—"}
          />
          <Row
            label="Stripe"
            value={
              <code className="text-xs break-all">
                {tx.stripePaymentIntentId ?? tx.stripeSessionId ?? "—"}
              </code>
            }
          />
          <Row label="購入手続き" value={formatDateTime(tx.createdAt)} />
          <Row label="支払い" value={formatDateTime(tx.paidAt)} />
          <Row label="発送・受渡の連絡" value={formatDateTime(tx.shippedAt)} />
          <Row label="受取確認" value={formatDateTime(tx.receivedAt)} />
          <Row label="完了" value={formatDateTime(tx.completedAt)} />
          {tx.canceledAt && <Row label="キャンセル" value={formatDateTime(tx.canceledAt)} />}
        </dl>
        {tx.shippingNote && (
          <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">
            <span className="mr-2 text-xs text-muted-foreground">出品者からの連絡</span>
            {tx.shippingNote}
          </p>
        )}
        {tx.canceledReason && (
          <p className="mt-3 rounded-lg bg-destructive/5 p-3 text-sm whitespace-pre-wrap">
            <span className="mr-2 text-xs text-muted-foreground">キャンセル理由</span>
            {tx.canceledReason}
          </p>
        )}
      </section>

      {tx.reports.length > 0 && (
        <section className="mt-5 rounded-xl border border-destructive/40 bg-background p-4">
          <h2 className="text-sm font-semibold">当事者からの申告</h2>
          <ul className="mt-3 space-y-3">
            {tx.reports.map((report) => (
              <li key={report.id} className="text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge variant={report.status === "open" ? "destructive" : "secondary"}>
                    {labelOf(REPORT_STATUSES, report.status)}
                  </Badge>
                  <span className="font-medium">{reportReasonLabel(report.reason)}</span>
                  <span className="text-xs text-muted-foreground">
                    {report.from === "buyer" ? "購入者" : report.from === "seller" ? "出品者" : "—"}
                    ・{formatDateTime(report.createdAt)}
                  </span>
                </p>
                {report.detail && (
                  <p className="mt-1.5 rounded-lg bg-muted/50 p-3 whitespace-pre-wrap">
                    {report.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Link
            href="/admin/reports?target_type=transaction"
            className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
          >
            通報管理で対応済みにする
          </Link>
        </section>
      )}

      <section className="mt-5 rounded-xl border bg-background p-4">
        <h2 className="text-sm font-semibold">
          メッセージ
          <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
            {tx.messages.length} 件
          </span>
        </h2>
        <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          閲覧のみです。運営からは書き込めず、閲覧しても当事者の既読にはなりません。閲覧は操作記録に残ります。
        </p>

        {tx.messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            この取引のメッセージはありません。
          </p>
        ) : (
          <ol className="mt-4 space-y-3" aria-label="メッセージ">
            {tx.messages.map((message, index) => (
              <li key={message.id}>
                {index === dividerIndex && (
                  <div
                    className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"
                    role="separator"
                  >
                    <span className="h-px flex-1 bg-border" />
                    ここから購入後
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg border p-3 text-sm",
                    message.from === "seller" ? "ml-auto bg-muted/50" : "bg-background",
                  )}
                >
                  <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {message.from === "buyer"
                        ? `購入者(${tx.buyer?.displayName ?? "退会済み"})`
                        : message.from === "seller"
                          ? `出品者(${tx.seller?.displayName ?? "退会済み"})`
                          : "その他"}
                    </span>
                    <time dateTime={message.createdAt} className="tabular-nums">
                      {formatDateTime(message.createdAt)}
                    </time>
                    {!message.readAt && <span>未読</span>}
                  </p>
                  <p className="break-words whitespace-pre-wrap">{message.body}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}
