import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** 管理画面のページ見出し */
export function AdminHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** 横スクロール可能なテーブルの枠 */
export function AdminTableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="w-full min-w-[720px] text-sm">{children}</table>
    </div>
  );
}

export function AdminEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border bg-background py-14 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

/** 一覧のページ送り。検索条件は現在のクエリを引き継ぐ。 */
export function AdminPagination({
  basePath,
  searchParams,
  page,
  totalPages,
  total,
}: {
  basePath: string;
  searchParams: Record<string, string | undefined>;
  page: number;
  totalPages: number;
  total: number;
}) {
  function href(nextPage: number): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") query.set(key, value);
    }
    if (nextPage > 1) query.set("page", String(nextPage));
    const qs = query.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm tabular-nums text-muted-foreground">全 {total.toLocaleString()} 件</p>

      {totalPages > 1 && (
        <nav aria-label="ページ送り" className="flex items-center gap-2">
          <PageLink href={href(page - 1)} disabled={page <= 1} label="前へ">
            <ChevronLeft className="size-4" aria-hidden />
            前へ
          </PageLink>
          <span className="text-sm tabular-nums text-muted-foreground">
            {page} / {totalPages}
          </span>
          <PageLink href={href(page + 1)} disabled={page >= totalPages} label="次へ">
            次へ
            <ChevronRight className="size-4" aria-hidden />
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  const className = cn(
    "inline-flex min-h-11 items-center gap-1 rounded-md border px-3 text-sm",
    disabled ? "pointer-events-none text-muted-foreground opacity-50" : "hover:bg-accent",
  );

  if (disabled) {
    return (
      <span className={className} aria-disabled>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={className} aria-label={label}>
      {children}
    </Link>
  );
}
