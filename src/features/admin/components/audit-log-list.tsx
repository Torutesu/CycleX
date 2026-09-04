import type { AuditLogRow } from "@/features/admin/queries";
import { ADMIN_ACTION_LABELS } from "@/features/admin/rules";
import { formatDateTime } from "@/lib/utils";

/** admin_audit_logs の一覧表示(利用者・取引の詳細で共通) */
export function AuditLogList({ logs }: { logs: AuditLogRow[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">管理操作の記録はありません。</p>;
  }
  return (
    <ul className="divide-y text-sm">
      {logs.map((log) => (
        <li key={log.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
          <span className="w-40 shrink-0 tabular-nums text-muted-foreground">
            {formatDateTime(log.createdAt)}
          </span>
          <span className="font-medium">{ADMIN_ACTION_LABELS[log.action] ?? log.action}</span>
          <span className="text-muted-foreground">{log.adminName ?? "—"}</span>
          {log.note && <span className="basis-full text-muted-foreground">{log.note}</span>}
        </li>
      ))}
    </ul>
  );
}
