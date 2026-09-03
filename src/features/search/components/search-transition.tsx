"use client";

import { createContext, useCallback, useContext, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type SearchNavigation = {
  /** 条件を変える移動が進行中か */
  pending: boolean;
  navigate: (href: string) => void;
};

const SearchNavigationContext = createContext<SearchNavigation>({
  pending: false,
  // 包み忘れたときに黙って動かなくなるより、遅くても移動できたほうがよい
  navigate: (href) => {
    window.location.assign(href);
  },
});

/**
 * 検索条件の切り替えを1つの「読み込み中」にまとめる。
 *
 * 並び替えも絞り込みもサーバー側で組み直すため、押してから結果が
 * 入れ替わるまで数百ミリ秒かかる。その間なにも変わらないと
 * 押せていないように見えるので、遷移の間ずっと分かるようにする。
 */
export function SearchTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const navigate = useCallback(
    (href: string) => {
      startTransition(() => router.push(href));
    },
    [router],
  );

  return (
    <SearchNavigationContext.Provider value={{ pending, navigate }}>
      {children}
    </SearchNavigationContext.Provider>
  );
}

export function useSearchNavigation(): SearchNavigation {
  return useContext(SearchNavigationContext);
}

/** 読み込み中の結果一覧。中身はサーバー側で組んだものをそのまま包む */
export function SearchResults({ children }: { children: ReactNode }) {
  const { pending } = useSearchNavigation();

  return (
    <div
      aria-busy={pending}
      className={cn("transition-opacity", pending && "pointer-events-none opacity-50")}
    >
      {children}
    </div>
  );
}

/**
 * リンクで組んだ条件切り替えを、上の「読み込み中」に乗せる。
 * 新しいタブで開く操作は邪魔しない。
 */
export function useChipNavigation() {
  const { navigate } = useSearchNavigation();

  return useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.button !== 0) return;
      event.preventDefault();
      navigate(href);
    },
    [navigate],
  );
}
