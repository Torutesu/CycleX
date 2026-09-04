"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Option } from "@/lib/constants";

const ALL = "__all__";

type FilterConfig = {
  name: string;
  label: string;
  options: readonly Option[];
  value: string;
};

type Props = {
  basePath: string;
  /** キーワード検索を出すか */
  searchPlaceholder?: string;
  searchValue?: string;
  filters?: FilterConfig[];
  /** 期間絞り込み(取引一覧で使用) */
  dateRange?: { from: string; to: string };
};

/**
 * 管理画面の一覧共通の検索・絞り込みフォーム。
 * 状態は URL クエリで保持し、ページは 1 に戻す。
 */
export function AdminFilters({
  basePath,
  searchPlaceholder,
  searchValue = "",
  filters = [],
  dateRange,
}: Props) {
  const router = useRouter();

  function submit(formData: FormData) {
    const query = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      const text = String(value).trim();
      if (text && text !== ALL) query.set(key, text);
    }
    const qs = query.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  }

  return (
    <form
      action={submit}
      className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-background p-3"
    >
      {searchPlaceholder && (
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            type="search"
            defaultValue={searchValue}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-11 pl-9"
          />
        </div>
      )}

      {filters.map((filter) => (
        <div key={filter.name} className="min-w-40">
          <label
            htmlFor={`filter-${filter.name}`}
            className="mb-1 block text-xs text-muted-foreground"
          >
            {filter.label}
          </label>
          <Select name={filter.name} defaultValue={filter.value || ALL}>
            <SelectTrigger id={`filter-${filter.name}`} className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>すべて</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}

      {dateRange && (
        <>
          <div>
            <label htmlFor="filter-from" className="mb-1 block text-xs text-muted-foreground">
              開始日
            </label>
            <Input
              id="filter-from"
              name="from"
              type="date"
              defaultValue={dateRange.from}
              className="h-11"
            />
          </div>
          <div>
            <label htmlFor="filter-to" className="mb-1 block text-xs text-muted-foreground">
              終了日
            </label>
            <Input
              id="filter-to"
              name="to"
              type="date"
              defaultValue={dateRange.to}
              className="h-11"
            />
          </div>
        </>
      )}

      <Button type="submit" className="h-11">
        絞り込む
      </Button>
    </form>
  );
}
