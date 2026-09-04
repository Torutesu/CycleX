import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  totalPages: number;
  /** ページ番号から遷移先を組み立てる */
  buildHref: (page: number) => string;
  className?: string;
};

/** ページ番号を省略記号込みで組み立てる(現在ページの前後1件を表示) */
export function pageItems(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const items: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) items.push("gap");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push("gap");
  items.push(total);

  return items;
}

/**
 * 検索以外の一覧(お気に入り・出品一覧など)で使う汎用のページ送り。
 * スマホは前後ボタン中心、PC はページ番号も表示する。
 */
export function Pagination({ page, totalPages, buildHref, className }: Props) {
  if (totalPages <= 1) return null;
  const current = Math.min(Math.max(1, page), totalPages);

  const edge = "inline-flex min-h-11 items-center gap-1 rounded-md border px-3 text-sm";

  return (
    <nav
      aria-label="ページ送り"
      className={cn("mt-8 flex items-center justify-center gap-1.5", className)}
    >
      {current > 1 ? (
        <Link href={buildHref(current - 1)} rel="prev" className={cn(edge, "hover:bg-accent")}>
          <ChevronLeft className="size-4" aria-hidden />
          前へ
        </Link>
      ) : (
        <span className={cn(edge, "text-muted-foreground opacity-50")}>
          <ChevronLeft className="size-4" aria-hidden />
          前へ
        </span>
      )}

      <span className="px-2 text-sm tabular-nums text-muted-foreground sm:hidden">
        {current} / {totalPages}
      </span>
      <ul className="hidden items-center gap-1 sm:flex">
        {pageItems(current, totalPages).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} className="px-1 text-muted-foreground">
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={buildHref(item)}
                aria-current={item === current ? "page" : undefined}
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-md text-sm tabular-nums",
                  item === current ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {item}
              </Link>
            </li>
          ),
        )}
      </ul>

      {current < totalPages ? (
        <Link href={buildHref(current + 1)} rel="next" className={cn(edge, "hover:bg-accent")}>
          次へ
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span className={cn(edge, "text-muted-foreground opacity-50")}>
          次へ
          <ChevronRight className="size-4" aria-hidden />
        </span>
      )}
    </nav>
  );
}
