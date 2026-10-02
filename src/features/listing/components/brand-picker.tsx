"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type BrandOption = { id: string; name: string };

type BrandPickerProps = {
  id: string;
  brands: BrandOption[];
  value: string;
  onChange: (value: string) => void;
  /** 「その他(自由入力)」に割り当てる値 */
  otherValue: string;
};

/**
 * 出品フォームのブランド選択。
 *
 * ブランドは 160 件を超えるため、ただ並べるとスクロールだけで探すことになる。
 * 検索の絞り込みと同じく、名前を打って絞れるようにする。
 */
export function BrandPicker({ id, brands, value, onChange, otherValue }: BrandPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  const matched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return brands;
    return brands.filter((brand) => brand.name.toLowerCase().includes(needle));
  }, [brands, query]);

  const selectedLabel =
    value === otherValue
      ? "その他(自由入力)"
      : (brands.find((brand) => brand.id === value)?.name ?? "");

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
    // 選んだあとは項目の位置へ戻す。開いた場所を見失わないようにする
    triggerRef.current?.focus();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden",
        )}
      >
        <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
          {selectedLabel || "選択してください"}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) gap-2 p-2">
        <Input
          type="search"
          autoFocus
          placeholder="ブランド名で絞り込む"
          aria-label="ブランド名で絞り込む"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10"
        />

        {matched.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            該当するブランドがありません。
          </p>
        )}

        {/*
          role="listbox" の直下は option だけに限られる。
          「その他」を常に押せる位置に置きたいので、リストから外に出すのではなく
          最後の option のまま sticky で下端に貼り付ける。
        */}
        <div role="listbox" aria-label="ブランド" className="max-h-64 overflow-y-auto">
          {matched.map((brand) => (
            <BrandOptionRow
              key={brand.id}
              label={brand.name}
              selected={brand.id === value}
              onSelect={() => choose(brand.id)}
            />
          ))}
          <BrandOptionRow
            label="その他(自由入力)"
            selected={value === otherValue}
            onSelect={() => choose(otherValue)}
            className="sticky bottom-0 border-t border-border bg-popover"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BrandOptionRow({
  label,
  selected,
  onSelect,
  className,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-hidden",
        className,
      )}
    >
      <Check
        className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")}
        aria-hidden
      />
      <span className="flex-1">{label}</span>
    </button>
  );
}
