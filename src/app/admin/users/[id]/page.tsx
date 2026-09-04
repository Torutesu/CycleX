import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { RatingStars } from "@/components/rating-stars";
import { getUserDetail } from "@/features/admin/queries";
import { suspendUser, unsuspendUser } from "@/features/admin/actions";
import { ReasonDialog, ConfirmButton } from "@/features/admin/components/admin-actions";
import { AdminHeader } from "@/features/admin/components/admin-table";
import { isActiveTransaction } from "@/features/transaction/state";
import { formatDate, formatDateTime, formatPrice } from "@/lib/utils";
import {
  LISTING_STATUSES,
  PREFECTURES,
  REPORT_REASONS,
  TRANSACTION_STATUSES,
  USER_STATUSES,
  labelOf,
  type TransactionStatus,
} from "@/lib/constants";

export const metadata: Metadata = { title: "利用者の詳細" };

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getUserDetail(id);
  if (!detail) notFound();

  const { user, listings, transactions, reviews, reports } = detail;
  const activeTransactions = transactions.filter((tx) =>
    isActiveTransaction(tx.status as TransactionStatus),
  );
  const publishedListings = listings.filter((listing) =>
    ["published", "withdrawn", "draft"].includes(listing.status),
  );

  return (
    <>
      <Link
        href="/admin/users"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        利用者管理
      </Link>

      <AdminHeader
        title={user.display_name}
        description={user.email}
        action={
          user.role === "admin" ? (
            <Badge variant="secondary">管理者</Badge>
          ) : user.status === "suspended" ? (
            <ConfirmButton
              label="利用停止を解除"
              confirmTitle="利用停止を解除しますか?"
              confirmDescription="この利用者は再びログインできるようになります。非表示にした出品は自動では戻りません。個別に解除してください。"
              onConfirm={async () => {
                "use server";
                return unsuspendUser(user.id);
              }}
              successMessage="利用停止を解除しました"
            />
          ) : user.status === "active" ? (
            <ReasonDialog
              trigger="利用停止にする"
              title="利用者を利用停止にしますか?"
              description="この利用者はログイン後、利用停止の案内のみが表示されるようになります。"
              reasonLabel="理由(記録用)"
              hidden={{ userId: user.id }}
              action={suspendUser}
              successMessage="利用停止にしました"
              warning={
                activeTransactions.length > 0
                  ? `進行中の取引が ${activeTransactions.length} 件あります。停止すると相手方が連絡できなくなるため、先に取引の扱いをご確認ください。`
                  : publishedListings.length > 0
                    ? `公開中・下書きの出品 ${publishedListings.length} 件も同時に非表示になります。`
                    : undefined
              }
            />
          ) : null
        }
      />

      {user.status === "suspended" && (
        <Alert variant="destructive" className="mb-5">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertDescription>
            利用停止中です。{user.suspended_reason && `理由: ${user.suspended_reason}`}
          </AlertDescription>
        </Alert>
      )}

      {/* 基本情報 */}
      <section className="rounded-xl border bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold">基本情報</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="利用者 ID" value={<code className="text-xs">{user.id}</code>} />
          <Row label="状態" value={labelOf(USER_STATUSES, user.status)} />
          <Row label="所在地" value={labelOf(PREFECTURES, user.prefecture) ?? "未設定"} />
          <Row label="登録日" value={formatDateTime(user.created_at)} />
          <Row
            label="メール確認"
            value={user.email_verified_at ? formatDateTime(user.email_verified_at) : "未確認"}
          />
          {user.withdrawn_at && <Row label="退会日" value={formatDateTime(user.withdrawn_at)} />}
        </dl>
        {user.bio && (
          <>
            <Separator className="my-3" />
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{user.bio}</p>
          </>
        )}
      </section>

      {/* 出品 */}
      <Section title="出品" count={listings.length}>
        {listings.length === 0 ? (
          <Empty message="出品はありません。" />
        ) : (
          <ul className="divide-y">
            {listings.map((listing) => (
              <li key={listing.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Link
                  href={`/items/${listing.id}`}
                  className="min-w-0 flex-1 truncate hover:underline"
                >
                  {listing.title || "(無題)"}
                </Link>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatPrice(listing.price)}
                </span>
                <Badge variant="outline" className="shrink-0">
                  {labelOf(LISTING_STATUSES, listing.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 取引 */}
      <Section title="取引" count={transactions.length}>
        {transactions.length === 0 ? (
          <Empty message="取引はありません。" />
        ) : (
          <ul className="divide-y">
            {transactions.map((tx) => (
              <li key={tx.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Link
                  href={`/admin/transactions?q=${encodeURIComponent(tx.listings?.title ?? "")}`}
                  className="min-w-0 flex-1 truncate hover:underline"
                >
                  {tx.listings?.title ?? "(削除された商品)"}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {tx.buyer_id === user.id ? "購入" : "出品"}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatPrice(tx.price)}
                </span>
                <Badge variant="outline" className="shrink-0">
                  {labelOf(TRANSACTION_STATUSES, tx.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 評価 */}
      <Section title="受けた評価" count={reviews.length}>
        {reviews.length === 0 ? (
          <Empty message="評価はありません。" />
        ) : (
          <ul className="divide-y">
            {reviews.map((review) => (
              <li key={review.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <RatingStars value={review.rating} />
                  {!review.is_published && <Badge variant="secondary">未公開</Badge>}
                  {review.is_hidden && <Badge variant="destructive">非表示</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDate(review.created_at)}
                  </span>
                </div>
                {review.comment && (
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{review.comment}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 通報 */}
      <Section title="この利用者への通報" count={reports.length}>
        {reports.length === 0 ? (
          <Empty message="通報はありません。" />
        ) : (
          <ul className="divide-y">
            {reports.map((report) => (
              <li key={report.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{labelOf(REPORT_REASONS, report.reason)}</Badge>
                  <Badge variant={report.status === "open" ? "destructive" : "secondary"}>
                    {report.status === "open" ? "未対応" : "対応済み"}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDate(report.created_at)}
                  </span>
                </div>
                {report.detail && (
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{report.detail}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-all">{value}</dd>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-xl border bg-background">
      <h2 className="border-b bg-muted/40 px-4 py-2.5 text-sm font-semibold">
        {title}
        <span className="ml-2 font-normal tabular-nums text-muted-foreground">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{message}</p>;
}
