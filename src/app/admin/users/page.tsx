import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listUsers } from "@/features/admin/queries";
import { AdminFilters } from "@/features/admin/components/admin-filters";
import {
  AdminEmpty,
  AdminHeader,
  AdminPagination,
  AdminTableShell,
} from "@/features/admin/components/admin-table";
import { formatDate } from "@/lib/utils";
import { USER_STATUSES, labelOf } from "@/lib/constants";

export const metadata: Metadata = { title: "利用者管理" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const result = await listUsers({
    query: params.q,
    status: params.status,
    page,
  });

  return (
    <>
      <AdminHeader
        title="利用者管理"
        description="会員の検索・確認と、利用停止の操作を行います。"
      />

      <AdminFilters
        basePath="/admin/users"
        searchPlaceholder="表示名・メールアドレスで検索"
        searchValue={params.q ?? ""}
        filters={[
          { name: "status", label: "状態", options: USER_STATUSES, value: params.status ?? "" },
        ]}
      />

      {result.items.length === 0 ? (
        <AdminEmpty message="該当する利用者はいません。" />
      ) : (
        <AdminTableShell>
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">表示名</th>
              <th className="px-4 py-2.5 font-medium">メールアドレス</th>
              <th className="px-4 py-2.5 font-medium">状態</th>
              <th className="px-4 py-2.5 text-right font-medium">出品</th>
              <th className="px-4 py-2.5 text-right font-medium">取引</th>
              <th className="px-4 py-2.5 font-medium">登録日</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {result.items.map((user) => (
              <tr key={user.id} className="hover:bg-accent/30">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {user.displayName}
                  </Link>
                  {user.role === "admin" && (
                    <Badge variant="secondary" className="ml-2">
                      管理者
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{user.email}</td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant={
                      user.status === "suspended"
                        ? "destructive"
                        : user.status === "withdrawn"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {labelOf(USER_STATUSES, user.status)}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{user.listingCount}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{user.transactionCount}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                  {formatDate(user.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTableShell>
      )}

      <AdminPagination
        basePath="/admin/users"
        searchParams={params}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}
