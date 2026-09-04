import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  findStateMismatches,
  getDashboardStats,
  getRecentActivity,
} from "@/features/admin/queries";
import { TrendChart } from "@/features/admin/components/trend-chart";
import { AdminHeader } from "@/features/admin/components/admin-table";
import { formatPrice, formatDateTime } from "@/lib/utils";
import { REPORT_REASONS, TRANSACTION_STATUSES, labelOf } from "@/lib/constants";

export const metadata: Metadata = { title: "ダッシュボード" };

export default async function AdminDashboardPage() {
  const [stats, activity, mismatches] = await Promise.all([
    getDashboardStats(30),
    getRecentActivity(),
    findStateMismatches(),
  ]);

  const cards = [
    { label: "会員数", value: stats.userCount.toLocaleString(), href: "/admin/users" },
    { label: "公開中の出品", value: stats.listingCount.toLocaleString(), href: "/admin/listings" },
    {
      label: "成立した取引",
      value: stats.transactionCount.toLocaleString(),
      href: "/admin/transactions",
    },
    {
      label: "流通総額(GMV)",
      value: formatPrice(stats.gmv),
      href: "/admin/transactions?status=completed",
    },
  ];

  return (
    <>
      <AdminHeader title="ダッシュボード" description="サービス全体の概況を表示します。" />

      {stats.openReportCount > 0 && (
        <Link
          href="/admin/reports?status=open"
          className="mb-5 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive hover:bg-destructive/10"
        >
          未対応の通報が <strong className="tabular-nums">{stats.openReportCount}</strong>{" "}
          件あります
        </Link>
      )}

      {mismatches.length > 0 && (
        <section className="mb-5 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <h2 className="font-semibold text-destructive">
            取引と商品の状態が食い違っています({mismatches.length}件)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            処理の途中で中断された可能性があります。取引画面で内容を確認し、必要なら手動で戻してください。
          </p>
          <ul className="mt-3 space-y-1.5">
            {mismatches.map((item) => (
              <li key={item.transactionId} className="text-xs">
                <Link
                  href={`/items/${item.listingId}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {item.listingTitle}
                </Link>
                <span className="ml-2 text-muted-foreground">{item.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <li key={card.label}>
            <Link
              href={card.href}
              className="block rounded-xl border bg-background p-4 transition-colors hover:border-primary"
            >
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="mt-1.5 text-xl font-bold tabular-nums lg:text-2xl">{card.value}</p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-6 rounded-xl border bg-background p-4">
        <h2 className="mb-4 text-sm font-semibold">直近30日の推移</h2>
        <TrendChart
          labels={stats.daily.map((d) => d.date)}
          series={[
            {
              key: "users",
              label: "新規会員",
              color: "oklch(0.49 0.085 176)",
              values: stats.daily.map((d) => d.users),
            },
            {
              key: "listings",
              label: "新規出品",
              color: "oklch(0.62 0.14 45)",
              values: stats.daily.map((d) => d.listings),
            },
            {
              key: "transactions",
              label: "成立取引",
              color: "oklch(0.55 0.16 265)",
              values: stats.daily.map((d) => d.transactions),
            },
          ]}
        />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-background">
          <h2 className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5 text-sm font-semibold">
            最近の通報
            <Link
              href="/admin/reports"
              className="text-xs font-normal text-primary hover:underline"
            >
              すべて見る
            </Link>
          </h2>
          {activity.reports.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              通報はありません。
            </p>
          ) : (
            <ul className="divide-y">
              {activity.reports.map((report) => (
                <li key={report.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <Badge
                    variant={report.status === "open" ? "destructive" : "secondary"}
                    className="shrink-0"
                  >
                    {report.status === "open" ? "未対応" : "対応済"}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">{report.targetLabel}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {labelOf(REPORT_REASONS, report.reason)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border bg-background">
          <h2 className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5 text-sm font-semibold">
            最近の取引
            <Link
              href="/admin/transactions"
              className="text-xs font-normal text-primary hover:underline"
            >
              すべて見る
            </Link>
          </h2>
          {activity.transactions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              取引はありません。
            </p>
          ) : (
            <ul className="divide-y">
              {activity.transactions.map((tx) => (
                <li key={tx.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{tx.listing?.title ?? "—"}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatPrice(tx.price)}
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {labelOf(TRANSACTION_STATUSES, tx.status)}
                  </Badge>
                  <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
                    {formatDateTime(tx.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
