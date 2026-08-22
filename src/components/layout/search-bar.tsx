"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchBarProps = {
  className?: string;
  placeholder?: string;
};

/** キーワード検索フォーム。送信で /search?q= へ遷移する。 */
export function SearchBar({ className, placeholder = "ブランド・車種で検索" }: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const keyword = searchParams.get("q") ?? "";

  return (
    <form
      role="search"
      className={cn("relative w-full", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const input = new FormData(event.currentTarget).get("q");
        const params = new URLSearchParams();
        const value = typeof input === "string" ? input.trim() : "";
        if (value) params.set("q", value);
        router.push(`/search${params.size ? `?${params.toString()}` : ""}`);
      }}
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      {/* key で再マウントし、検索条件の変化に非制御のまま追従させる */}
      <Input
        key={keyword}
        type="search"
        name="q"
        defaultValue={keyword}
        placeholder={placeholder}
        aria-label="キーワード検索"
        className="h-11 rounded-full pl-9"
      />
    </form>
  );
}
