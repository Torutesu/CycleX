"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toQueryString, type SearchParams } from "@/features/search/params";
import { useChipNavigation } from "@/features/search/components/search-transition";
import { cn } from "@/lib/utils";

type Props = {
  params: SearchParams;
  totalPages: number;
};

/** ページ番号を省略記号込みで組み立てる(現在ページの前後2件を表示) */
function pageItems(current: number, total: number): (number | "gap")[] {
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

function href(params: SearchParams, page: number): string {
  const query = toQueryString(params, { page });
  return `/search${query ? `?${query}` : ""}`;
}

/** FR-04-4: ページネーション。スマホは前後ボタン中心、PC はページ番号も表示する。 */
export function SearchPagination({ params, totalPages }: Props) {
  // 読み込み中が分かるよう、条件の切り替えと同じ仕組みに乗せる
  const onPageClick = useChipNavigation();

  if (totalPages <= 1) return null;

  const current = Math.min(params.page, totalPages);

  return (
    <nav aria-label="ページ送り" className="mt-8 flex items-center justify-center gap-1.5">
      {current > 1 ? (
        <Link
          href={href(params, current - 1)}
          onClick={(event) => onPageClick(event, href(params, current - 1))}
          rel="prev"
          className="inline-flex min-h-11 items-center gap-1 rounded-md border px-3 text-sm hover:bg-accent"
        >
          <ChevronLeft className="size-4" aria-hidden />
          前へ
        </Link>
      ) : (
        <span className="inline-flex min-h-11 items-center gap-1 rounded-md border px-3 text-sm text-muted-foreground opacity-50">
          <ChevronLeft className="size-4" aria-hidden />
          前へ
        </span>
      )}

      <ul className="hidden items-center gap-1 sm:flex">
        {pageItems(current, totalPages).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} className="px-1 text-sm text-muted-foreground">
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={href(params, item)}
                onClick={(event) => onPageClick(event, href(params, item))}
                aria-current={item === current ? "page" : undefined}
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-md text-sm tabular-nums",
                  item === current
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "border hover:bg-accent",
                )}
              >
                {item}
              </Link>
            </li>
          ),
        )}
      </ul>

      <span className="text-sm tabular-nums text-muted-foreground sm:hidden">
        {current} / {totalPages}
      </span>

      {current < totalPages ? (
        <Link
          href={href(params, current + 1)}
          onClick={(event) => onPageClick(event, href(params, current + 1))}
          rel="next"
          className="inline-flex min-h-11 items-center gap-1 rounded-md border px-3 text-sm hover:bg-accent"
        >
          次へ
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span className="inline-flex min-h-11 items-center gap-1 rounded-md border px-3 text-sm text-muted-foreground opacity-50">
          次へ
          <ChevronRight className="size-4" aria-hidden />
        </span>
      )}
    </nav>
  );
}
