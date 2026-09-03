"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, Search, Tag, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CATEGORIES } from "@/lib/constants";
import { brandNamesForKeyword } from "@/features/search/params";
import { cn } from "@/lib/utils";
import { clearHistory, pushHistory, readHistory } from "@/components/layout/search-history";

type SearchBarProps = {
  className?: string;
  placeholder?: string;
};

type Suggestion = {
  /** 検索語 */
  value: string;
  /** 履歴なら時計、候補ならタグ */
  kind: "history" | "brand" | "category";
};

/** ブランド名は一度取れば十分なので、画面をまたいで使い回す */
let brandCache: string[] | null = null;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s　]/g, "");
}

/**
 * キーワード検索フォーム。送信で /search?q= へ遷移する。
 *
 * 空の検索窓だけだと何を打てばよいか分からないので、
 * 履歴とブランド・カテゴリの候補を出す。
 */
export function SearchBar({ className, placeholder = "ブランド・車種で検索" }: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const keyword = searchParams.get("q") ?? "";

  const listId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [value, setValue] = useState(keyword);
  const [open, setOpen] = useState(false);
  // 履歴は端末の中にある。サーバー側では空のまま(閉じているので描画差は出ない)
  const [history, setHistory] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readHistory(),
  );
  const [brands, setBrands] = useState<string[]>(brandCache ?? []);
  const [active, setActive] = useState(-1);

  // 検索条件が変わったら入力も追従させる(描画中の調整。effect で書くと二度描画になる)
  const [lastKeyword, setLastKeyword] = useState(keyword);
  if (keyword !== lastKeyword) {
    setLastKeyword(keyword);
    setValue(keyword);
  }

  // 候補は入力を始めた人にだけ取りにいく
  useEffect(() => {
    if (!open || brandCache) return;
    let alive = true;
    fetch("/api/brands")
      .then((response) => (response.ok ? response.json() : { brands: [] }))
      .then((data: { brands?: string[] }) => {
        brandCache = data.brands ?? [];
        if (alive) setBrands(brandCache);
      })
      .catch(() => {
        // 候補が出せなくても検索そのものは使える
      });
    return () => {
      alive = false;
    };
  }, [open]);

  // 外を触ったら閉じる
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!formRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const query = normalize(value);
  const suggestions: Suggestion[] = query
    ? [
        // 結果の絞り込みと同じ読み替えを通す(「ピナ」で Pinarello を出す)
        ...brandNamesForKeyword(value, brands)
          .slice(0, 5)
          .map((brand): Suggestion => ({ value: brand, kind: "brand" })),
        ...CATEGORIES.filter((category) => normalize(category.label).includes(query))
          .slice(0, 3)
          .map((category): Suggestion => ({ value: category.label, kind: "category" })),
      ]
    : history.map((item): Suggestion => ({ value: item, kind: "history" }));

  function go(next: string) {
    const trimmed = next.trim();
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    if (trimmed) setHistory(pushHistory(trimmed));
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (suggestions.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => {
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = current + step;
        if (next < 0) return suggestions.length - 1;
        if (next >= suggestions.length) return 0;
        return next;
      });
    }
  }

  const showPanel = open && suggestions.length > 0;

  return (
    <form
      ref={formRef}
      role="search"
      className={cn("relative w-full", className)}
      onSubmit={(event) => {
        event.preventDefault();
        go(active >= 0 ? suggestions[active].value : value);
      }}
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />

      <Input
        ref={inputRef}
        type="text"
        name="q"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="キーワード検索"
        autoComplete="off"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className="h-11 rounded-full pl-9 pr-10"
      />

      {value && (
        <button
          type="button"
          aria-label="キーワードを消す"
          onClick={() => {
            setValue("");
            setActive(-1);
            inputRef.current?.focus();
          }}
          className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-xl border bg-popover shadow-lg">
          {!query && (
            <div className="flex items-center justify-between px-3 pt-2 text-xs text-muted-foreground">
              <span>最近の検索</span>
              <button
                type="button"
                onClick={() => {
                  clearHistory();
                  setHistory([]);
                  setOpen(false);
                }}
                className="min-h-8 px-1 transition-colors hover:text-foreground"
              >
                履歴を消す
              </button>
            </div>
          )}

          <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {suggestions.map((suggestion, index) => {
              const Icon = suggestion.kind === "history" ? Clock : Tag;
              return (
                <li key={`${suggestion.kind}-${suggestion.value}`}>
                  <button
                    type="button"
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(suggestion.value)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm transition-colors",
                      index === active ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{suggestion.value}</span>
                    {suggestion.kind === "category" && (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        カテゴリ
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </form>
  );
}
