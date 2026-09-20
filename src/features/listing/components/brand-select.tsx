"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { brandMatches, type BrandOption } from "@/features/search/params";
import { cn } from "@/lib/utils";

/** 一覧に無いメーカーを自由入力するための値 */
export const BRAND_OTHER = "__other__";

type BrandSelectProps = {
  /** Field のラベルと紐づける id。エラー時のスクロール先にもなる */
  id: string;
  brands: BrandOption[];
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
};

type Choice = { value: string; label: string; kana: string | null };

const OTHER_CHOICE: Choice = { value: BRAND_OTHER, label: "その他(自由入力)", kana: null };

/** 見出しに使う頭文字。英字以外は "#" にまとめる */
function initialOf(name: string): string {
  const head = name[0]?.toUpperCase() ?? "#";
  return /[A-Z]/.test(head) ? head : "#";
}

/**
 * メーカーの選択欄。
 *
 * 登録メーカーが200件近くあり、素の <select> では目的の1件まで
 * 延々とスクロールすることになる。英字でもカナでも絞り込めるようにして、
 * 「ぴなれろ」「トレック」のどちらの打ち方でもたどり着けるようにする。
 */
export function BrandSelect({ id, brands, value, onChange, hasError }: BrandSelectProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 頭文字の見出しが飛び飛びにならないよう、大文字小文字を無視して並べ直す
  // (DB の照合順序に任せると 'tern' だけが末尾に落ちる環境がある)
  const choices: Choice[] = useMemo(
    () =>
      brands
        .map((brand) => ({ value: brand.id, label: brand.name, kana: brand.kana }))
        .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" })),
    [brands],
  );

  const filtered = useMemo(() => {
    const word = query.trim();
    if (!word) return [...choices, OTHER_CHOICE];
    const matched = choices.filter((choice) =>
      brandMatches(word, { name: choice.label, kana: choice.kana }),
    );
    // 一覧に無いメーカーだったときのために、絞り込み中でも逃げ道は残す
    return [...matched, OTHER_CHOICE];
  }, [choices, query]);

  const selected =
    value === BRAND_OTHER
      ? OTHER_CHOICE
      : (choices.find((choice) => choice.value === value) ?? null);

  function choose(choice: Choice) {
    onChange(choice.value);
    setOpen(false);
    setQuery("");
  }

  /** 候補を選びながらスクロールもついてくるようにする */
  function moveActive(step: number) {
    setActive((current) => {
      const next = current + step;
      const index = next < 0 ? filtered.length - 1 : next >= filtered.length ? 0 : next;
      listRef.current
        ?.querySelector(`[data-index="${index}"]`)
        ?.scrollIntoView({ block: "nearest" });
      return index;
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const choice = filtered[active];
      if (choice) choose(choice);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-invalid={hasError || undefined}
          // 見た目は他の選択欄(SelectTrigger)に合わせる
          className={cn(
            "flex h-11 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none select-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
            "dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? (
              <>
                {selected.label}
                {selected.kana && (
                  <span className="ml-1.5 text-xs text-muted-foreground">{selected.kana}</span>
                )}
              </>
            ) : (
              "選択してください"
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) gap-0 p-0"
        // 開いたら絞り込みの入力欄に入れる(一覧の先頭ではなく)
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="relative border-b p-2">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="メーカー名・カナで絞り込む"
            aria-label="メーカーを絞り込む"
            autoComplete="off"
            className="h-10 pl-8"
          />
        </div>

        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label="メーカー"
          className="max-h-72 overflow-y-auto py-1"
        >
          {filtered.map((choice, index) => {
            const previous = filtered[index - 1];
            // 頭文字の見出し。絞り込んでいないときの目当ては「T の辺り」なので
            const heading =
              choice.value !== BRAND_OTHER &&
              (!previous ||
                previous.value === BRAND_OTHER ||
                initialOf(previous.label) !== initialOf(choice.label))
                ? initialOf(choice.label)
                : null;

            return (
              <li key={choice.value}>
                {heading && (
                  <div className="px-3 pb-0.5 pt-2 text-xs font-semibold text-muted-foreground">
                    {heading}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  data-index={index}
                  aria-selected={choice.value === value}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(choice)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm transition-colors",
                    index === active ? "bg-accent" : "hover:bg-accent/60",
                  )}
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      choice.value === value ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{choice.label}</span>
                  {choice.kana && (
                    <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                      {choice.kana}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
