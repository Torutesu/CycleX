import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listReports } from "@/features/admin/queries";
import { resolveReport } from "@/features/admin/actions";
import { AdminFilters } from "@/features/admin/components/admin-filters";
import { ReasonDialog } from "@/features/admin/components/admin-actions";
import { AdminEmpty, AdminHeader, AdminPagination } from "@/features/admin/components/admin-table";
import { formatDateTime } from "@/lib/utils";
import { REPORT_REASONS, REPORT_STATUSES, labelOf } from "@/lib/constants";

export const metadata: Metadata = { title: "通報管理" };

const TARGET_TYPES = [
  { value: "listing", label: "商品" },
  { value: "user", label: "利用者" },
] as const;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const result = await listReports({
    status: params.status,
    targetType: params.target_type,
    page,
  });

  return (
    <>
      <AdminHeader
        title="通報管理"
        description="通報の内容を確認し、対応状況を記録します。通報者の情報は被通報者に開示されません。"
      />

      <AdminFilters
        basePath="/admin/reports"
        filters={[
          {
            name: "status",
            label: "対応状況",
            options: REPORT_STATUSES,
            value: params.status ?? "",
          },
          {
            name: "target_type",
            label: "対象",
            options: TARGET_TYPES,
            value: params.target_type ?? "",
          },
        ]}
      />

      {result.items.length === 0 ? (
        <AdminEmpty message="該当する通報はありません。" />
      ) : (
        <ul className="space-y-3">
          {result.items.map((report) => (
            <li key={report.id} className="rounded-xl border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={report.status === "open" ? "destructive" : "secondary"}>
                  {labelOf(REPORT_STATUSES, report.status)}
                </Badge>
                <Badge variant="outline">
                  {report.targetType === "listing" ? "商品" : "利用者"}
                </Badge>
                <Badge variant="outline">{labelOf(REPORT_REASONS, report.reason)}</Badge>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {formatDateTime(report.createdAt)}
                </span>
              </div>

              <p className="mt-3 text-sm">
                <span className="text-muted-foreground">対象: </span>
                <Link
                  href={
                    report.targetType === "listing"
                      ? `/items/${report.targetId}`
                      : `/admin/users/${report.targetId}`
                  }
                  className="font-medium text-primary hover:underline"
                >
                  {report.targetLabel}
                </Link>
              </p>

              <p className="mt-1 text-sm">
                <span className="text-muted-foreground">通報者: </span>
                {report.reporter ? (
                  <Link href={`/admin/users/${report.reporter.id}`} className="hover:underline">
                    {report.reporter.displayName}
                  </Link>
                ) : (
                  "—"
                )}
              </p>

              {report.detail && (
                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">
                  {report.detail}
                </p>
              )}

              {report.resolvedNote && (
                <p className="mt-3 text-sm">
                  <span className="text-muted-foreground">対応メモ: </span>
                  {report.resolvedNote}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={
                    report.targetType === "listing"
                      ? `/admin/listings?id=${report.targetId}`
                      : `/admin/users/${report.targetId}`
                  }
                  className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm hover:bg-accent"
                >
                  {report.targetType === "listing" ? "出品管理で開く" : "利用者の詳細を開く"}
                </Link>

                {report.status === "open" && (
                  <ReasonDialog
                    trigger="対応済みにする"
                    title="この通報を対応済みにしますか?"
                    description="対応の記録として残ります。必要な非表示化は、対象の管理画面から別途行ってください。"
                    reasonLabel="対応メモ(任意)"
                    reasonName="note"
                    hidden={{ reportId: report.id }}
                    action={resolveReport}
                    successMessage="対応済みにしました"
                    variant="outline"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AdminPagination
        basePath="/admin/reports"
        searchParams={params}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}
