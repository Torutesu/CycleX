"use client";

import Link from "next/link";
import { CATEGORIES, PRICE_PRESETS } from "@/lib/constants";
import { toQueryString, type SearchParams } from "@/features/search/params";
import { useChipNavigation } from "@/features/search/components/search-transition";
import { cn } from "@/lib/utils";

/**
 * 一覧の上に常に出しておく絞り込み。
 *
 * スマホでは絞り込みがボトムシートの中にしか無く、
 * カテゴリを1つ変えるだけでもシートを開いて選んで閉じる必要があった。
 * よく使う2軸(カテゴリと価格帯)だけを外に出し、1タップで切り替えられるようにする。
 * それ以外の条件は従来どおりシート側に置く。
 *
 * リンクで組むのは、押した先の URL が読めて共有でき、
 * 先読みも効くため(検索条件はすべて URL に載っている)。
 */

/** 価格帯はシート/サイドバーと同じ区切り(FR-04-2)。画面内で 2 系統にならないようにする */
const PRICE_BANDS: readonly { label: string; min: number | null; max: number | null }[] =
  PRICE_PRESETS;

function chipClass(active: boolean) {
  return cn(
    "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors active:scale-95",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "bg-background text-muted-foreground hover:border-primary hover:text-foreground",
  );
}

function href(params: SearchParams, overrides: Partial<SearchParams>) {
  const query = toQueryString(params, { ...overrides, page: 1 });
  return `/search${query ? `?${query}` : ""}`;
}

export function QuickFilters({ params }: { params: SearchParams }) {
  // 押した瞬間に一覧が薄くなるよう、遷移は共通の仕組みに乗せる
  const onChipClick = useChipNavigation();

  const priceActive = (band: (typeof PRICE_BANDS)[number]) =>
    params.priceMin === band.min && params.priceMax === band.max;

  return (
    // サイドバーが出る画面では同じ操作が並んでしまうので、そこでは隠す
    <div className="-mx-4 space-y-2 lg:hidden">
      <ul className="flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <li>
          <Link
            href={href(params, { category: null, sub: null })}
            onClick={(event) => onChipClick(event, href(params, { category: null, sub: null }))}
            aria-current={params.category ? undefined : "true"}
            className={chipClass(!params.category)}
          >
            すべて
          </Link>
        </li>
        {CATEGORIES.map((category) => {
          const active = params.category === category.value;
          const target = href(params, { category: active ? null : category.value, sub: null });
          return (
            <li key={category.value}>
              <Link
                href={target}
                onClick={(event) => onChipClick(event, target)}
                aria-current={active ? "true" : undefined}
                className={chipClass(active)}
              >
                {category.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <ul className="flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRICE_BANDS.map((band) => {
          const active = priceActive(band);
          const target = href(params, {
            priceMin: active ? null : band.min,
            priceMax: active ? null : (band.max ?? null),
          });
          return (
            <li key={band.label}>
              <Link
                href={target}
                onClick={(event) => onChipClick(event, target)}
                aria-current={active ? "true" : undefined}
                className={chipClass(active)}
              >
                {band.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
