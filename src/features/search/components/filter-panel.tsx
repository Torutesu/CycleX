"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  CATEGORIES,
  CONDITIONS,
  FRAME_SIZES,
  PARTS_SUBCATEGORIES,
  PREFECTURES,
  PRICE_PRESETS,
} from "@/lib/constants";
import { toQueryString, type SearchParams } from "@/features/search/params";
import { useSearchNavigation } from "@/features/search/components/search-transition";
import { cn } from "@/lib/utils";

type FilterPanelProps = {
  params: SearchParams;
  brands: { id: string; name: string }[];
  /** 適用後に呼ばれる(ボトムシートを閉じるため) */
  onApplied?: () => void;
};

/** FR-04-2: 絞り込みフォーム。スマホはボトムシート、PC はサイドバーに配置する。 */
export function FilterPanel({ params, brands, onApplied }: FilterPanelProps) {
  const { navigate } = useSearchNavigation();
  const [draft, setDraft] = useState<SearchParams>(params);
  const [brandQuery, setBrandQuery] = useState("");

  function update(patch: Partial<SearchParams>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function toggle(key: "size" | "pref" | "condition" | "brand", value: string) {
    setDraft((prev) => {
      const current = prev[key];
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  }

  function apply() {
    // 条件を変えたら1ページ目に戻す
    const query = toQueryString(draft, { page: 1 });
    navigate(`/search${query ? `?${query}` : ""}`);
    onApplied?.();
  }

  function clearAll() {
    const cleared: SearchParams = {
      ...draft,
      category: null,
      sub: null,
      brand: [],
      priceMin: null,
      priceMax: null,
      size: [],
      pref: [],
      condition: [],
      includeSold: false,
      page: 1,
    };
    setDraft(cleared);
    const query = toQueryString(cleared, { page: 1 });
    navigate(`/search${query ? `?${query}` : ""}`);
    onApplied?.();
  }

  const filteredBrands = brandQuery
    ? brands.filter((brand) => brand.name.toLowerCase().includes(brandQuery.toLowerCase()))
    : brands;

  // min-h-0 が無いと flex-1 の領域が内容ぶん伸び、シートの上部が画面外へ押し出される
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-4">
        {/* カテゴリ */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">カテゴリ</h3>
          <ul className="space-y-1">
            <li>
              <button
                type="button"
                onClick={() => update({ category: null, sub: null })}
                className={cn(
                  "flex min-h-11 w-full items-center rounded-md px-2 text-sm",
                  draft.category === null ? "bg-accent font-medium" : "hover:bg-accent/50",
                )}
              >
                すべて
              </button>
            </li>
            {CATEGORIES.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() =>
                    update({
                      category: option.value,
                      sub: option.value === "parts" ? draft.sub : null,
                    })
                  }
                  className={cn(
                    "flex min-h-11 w-full items-center rounded-md px-2 text-sm",
                    draft.category === option.value
                      ? "bg-accent font-medium"
                      : "hover:bg-accent/50",
                  )}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>

          {draft.category === "parts" && (
            <div className="mt-3 border-l pl-3">
              <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">パーツの種類</h4>
              <ul className="space-y-1">
                <li>
                  <button
                    type="button"
                    onClick={() => update({ sub: null })}
                    className={cn(
                      "flex min-h-9 w-full items-center rounded-md px-2 text-sm",
                      draft.sub === null ? "bg-accent font-medium" : "hover:bg-accent/50",
                    )}
                  >
                    すべて
                  </button>
                </li>
                {PARTS_SUBCATEGORIES.map((option) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      onClick={() => update({ sub: option.value })}
                      className={cn(
                        "flex min-h-9 w-full items-center rounded-md px-2 text-sm",
                        draft.sub === option.value ? "bg-accent font-medium" : "hover:bg-accent/50",
                      )}
                    >
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <Separator />

        {/* 価格帯 */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">価格帯</h3>
          <ul className="flex flex-wrap gap-2">
            {PRICE_PRESETS.map((preset) => {
              const active = draft.priceMin === preset.min && draft.priceMax === preset.max;
              return (
                <li key={preset.label}>
                  <button
                    type="button"
                    onClick={() =>
                      update(
                        active
                          ? { priceMin: null, priceMax: null }
                          : { priceMin: preset.min, priceMax: preset.max },
                      )
                    }
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full border px-3 text-sm",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    {preset.label}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="下限"
              aria-label="価格の下限"
              value={draft.priceMin ?? ""}
              onChange={(e) => update({ priceMin: e.target.value ? Number(e.target.value) : null })}
              className="h-11 tabular-nums"
            />
            <span className="text-muted-foreground">〜</span>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="上限"
              aria-label="価格の上限"
              value={draft.priceMax ?? ""}
              onChange={(e) => update({ priceMax: e.target.value ? Number(e.target.value) : null })}
              className="h-11 tabular-nums"
            />
          </div>
        </section>

        <Separator />

        {/* ブランド */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">ブランド</h3>
          <Input
            type="search"
            placeholder="ブランド名で絞り込む"
            aria-label="ブランド名で絞り込む"
            value={brandQuery}
            onChange={(e) => setBrandQuery(e.target.value)}
            className="mb-2 h-11"
          />
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {filteredBrands.map((brand) => (
              <li key={brand.id} className="flex min-h-11 items-center gap-2.5">
                <Checkbox
                  id={`brand-${brand.id}`}
                  checked={draft.brand.includes(brand.id)}
                  onCheckedChange={() => toggle("brand", brand.id)}
                />
                <Label
                  htmlFor={`brand-${brand.id}`}
                  className="flex-1 cursor-pointer text-sm font-normal"
                >
                  {brand.name}
                </Label>
              </li>
            ))}
            {filteredBrands.length === 0 && (
              <li className="py-2 text-sm text-muted-foreground">該当するブランドがありません</li>
            )}
          </ul>
        </section>

        <Separator />

        {/* フレームサイズ */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">フレームサイズ</h3>
          <ul className="flex flex-wrap gap-2">
            {FRAME_SIZES.filter((size) => size.value !== "other").map((size) => (
              <li key={size.value}>
                <button
                  type="button"
                  onClick={() => toggle("size", size.value)}
                  aria-pressed={draft.size.includes(size.value)}
                  className={cn(
                    "inline-flex size-11 items-center justify-center rounded-md border text-sm",
                    draft.size.includes(size.value)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {size.label}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <Separator />

        {/* コンディション */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">コンディション</h3>
          <ul className="space-y-0.5">
            {CONDITIONS.map((condition) => (
              <li key={condition.value} className="flex min-h-11 items-center gap-2.5">
                <Checkbox
                  id={`cond-${condition.value}`}
                  checked={draft.condition.includes(condition.value)}
                  onCheckedChange={() => toggle("condition", condition.value)}
                />
                <Label
                  htmlFor={`cond-${condition.value}`}
                  className="flex-1 cursor-pointer text-sm font-normal"
                >
                  {condition.label}
                </Label>
              </li>
            ))}
          </ul>
        </section>

        <Separator />

        {/* 地域 */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">地域</h3>
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {PREFECTURES.map((pref) => (
              <li key={pref.value} className="flex min-h-11 items-center gap-2.5">
                <Checkbox
                  id={`pref-${pref.value}`}
                  checked={draft.pref.includes(pref.value)}
                  onCheckedChange={() => toggle("pref", pref.value)}
                />
                <Label
                  htmlFor={`pref-${pref.value}`}
                  className="flex-1 cursor-pointer text-sm font-normal"
                >
                  {pref.label}
                </Label>
              </li>
            ))}
          </ul>
        </section>

        <Separator />

        {/* 販売状況 */}
        <section>
          <div className="flex min-h-11 items-center gap-2.5">
            <Checkbox
              id="include-sold"
              checked={draft.includeSold}
              onCheckedChange={(checked) => update({ includeSold: checked === true })}
            />
            <Label htmlFor="include-sold" className="cursor-pointer text-sm font-normal">
              売却済みの商品も表示する
            </Label>
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 flex gap-3 border-t bg-background pt-3">
        <Button type="button" variant="outline" className="h-12 flex-1" onClick={clearAll}>
          クリア
        </Button>
        <Button type="button" className="h-12 flex-1" onClick={apply}>
          この条件で表示
        </Button>
      </div>
    </div>
  );
}
