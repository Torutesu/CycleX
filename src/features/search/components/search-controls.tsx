"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterPanel } from "@/features/search/components/filter-panel";
import { useSearchNavigation } from "@/features/search/components/search-transition";
import { toQueryString, hasActiveFilters, type SearchParams } from "@/features/search/params";
import {
  CATEGORIES,
  CONDITIONS,
  PARTS_SUBCATEGORIES,
  PREFECTURES,
  SORT_OPTIONS,
  labelOf,
} from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import type { SortOption } from "@/lib/constants";

type Props = {
  params: SearchParams;
  brands: { id: string; name: string }[];
};

/** スマホ用の絞り込みトリガー(ボトムシート) */
export function MobileFilterSheet({ params, brands }: Props) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(params);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-11 lg:hidden">
          <SlidersHorizontal className="size-4" aria-hidden />
          絞り込み
          {activeCount > 0 && (
            <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      {/*
        SheetContent は data-[side=bottom]:h-auto を持つため、素の h-* では上書きできない。
        max-h で頭打ちにし、内部の overflow-y-auto にスクロールさせる。
        自動フォーカスは中身をスクロールさせるので無効化する。
      */}
      <SheetContent
        side="bottom"
        className="flex max-h-[85dvh] flex-col px-4 pb-4"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="px-0">
          <SheetTitle>絞り込み</SheetTitle>
        </SheetHeader>
        <FilterPanel
          key={toQueryString(params)}
          params={params}
          brands={brands}
          onApplied={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

/** 並び替えセレクト */
export function SortSelect({ params }: { params: SearchParams }) {
  const { pending, navigate } = useSearchNavigation();

  return (
    <Select
      value={params.sort}
      onValueChange={(value) => {
        const query = toQueryString(params, { sort: value as SortOption, page: 1 });
        navigate(`/search${query ? `?${query}` : ""}`);
      }}
    >
      <SelectTrigger className="h-11 w-40" aria-label="並び替え">
        {pending && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type Chip = { key: string; label: string; next: Partial<SearchParams> };

/** 適用中の条件チップ。個別解除とすべて解除ができる(FR-04-2)。 */
export function ActiveFilterChips({
  params,
  brands,
}: {
  params: SearchParams;
  brands: { id: string; name: string }[];
}) {
  const { navigate } = useSearchNavigation();
  if (!hasActiveFilters(params)) return null;

  const chips: Chip[] = [];

  if (params.category) {
    chips.push({
      key: "category",
      label: labelOf(CATEGORIES, params.category) ?? params.category,
      next: { category: null, sub: null },
    });
  }
  if (params.sub) {
    chips.push({
      key: "sub",
      label: labelOf(PARTS_SUBCATEGORIES, params.sub) ?? params.sub,
      next: { sub: null },
    });
  }
  for (const id of params.brand) {
    const brand = brands.find((item) => item.id === id);
    chips.push({
      key: `brand-${id}`,
      label: brand?.name ?? "ブランド",
      next: { brand: params.brand.filter((item) => item !== id) },
    });
  }
  if (params.priceMin !== null || params.priceMax !== null) {
    const min = params.priceMin !== null ? formatPrice(params.priceMin) : "";
    const max = params.priceMax !== null ? formatPrice(params.priceMax) : "";
    chips.push({
      key: "price",
      label: `${min}〜${max}`,
      next: { priceMin: null, priceMax: null },
    });
  }
  for (const size of params.size) {
    chips.push({
      key: `size-${size}`,
      label: `サイズ ${size}`,
      next: { size: params.size.filter((item) => item !== size) },
    });
  }
  for (const pref of params.pref) {
    chips.push({
      key: `pref-${pref}`,
      label: labelOf(PREFECTURES, pref) ?? pref,
      next: { pref: params.pref.filter((item) => item !== pref) },
    });
  }
  for (const condition of params.condition) {
    chips.push({
      key: `cond-${condition}`,
      label: labelOf(CONDITIONS, condition) ?? condition,
      next: { condition: params.condition.filter((item) => item !== condition) },
    });
  }
  if (params.includeSold) {
    chips.push({ key: "sold", label: "売却済み含む", next: { includeSold: false } });
  }

  function go(next: Partial<SearchParams>) {
    const query = toQueryString(params, { ...next, page: 1 });
    navigate(`/search${query ? `?${query}` : ""}`);
  }

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => go(chip.next)}
            className="inline-flex min-h-11 items-center gap-1 rounded-full bg-accent px-3 text-xs text-accent-foreground hover:bg-accent/70"
          >
            {chip.label}
            <X className="size-3" aria-hidden />
            <span className="sr-only">を解除</span>
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={() =>
            go({
              category: null,
              sub: null,
              brand: [],
              priceMin: null,
              priceMax: null,
              size: [],
              pref: [],
              condition: [],
              includeSold: false,
            })
          }
          className="inline-flex min-h-11 items-center px-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          すべて解除
        </button>
      </li>
    </ul>
  );
}

function countActiveFilters(params: SearchParams): number {
  return (
    (params.category ? 1 : 0) +
    params.brand.length +
    (params.priceMin !== null || params.priceMax !== null ? 1 : 0) +
    params.size.length +
    params.pref.length +
    params.condition.length +
    (params.includeSold ? 1 : 0)
  );
}
