"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { toggleFavorite } from "@/features/favorite/actions";
import { cn } from "@/lib/utils";

type FavoriteButtonProps = {
  listingId: string;
  favorited: boolean;
  /** 件数を併記するか(商品詳細のみ) */
  count?: number;
  /**
   * 一覧カードなど、同じ画面に複数並ぶ場合の商品名。
   * 付けないとどのボタンも「お気に入りに追加」としか読み上げられず区別できない。
   */
  listingTitle?: string;
  /** ログインしていない場合はログイン画面へ誘導する */
  isLoggedIn: boolean;
  /** 自分の出品では押せないようにする */
  disabled?: boolean;
  variant?: "icon" | "full";
  className?: string;
};

export function FavoriteButton({
  listingId,
  favorited,
  count,
  listingTitle,
  isLoggedIn,
  disabled,
  variant = "icon",
  className,
}: FavoriteButtonProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    { favorited, count: count ?? 0 },
    (state, next: boolean) => ({
      favorited: next,
      count: Math.max(0, state.count + (next ? 1 : -1)),
    }),
  );

  function handleClick(event: React.MouseEvent) {
    // カード全体がリンクなので、ボタン押下では遷移させない
    event.preventDefault();
    event.stopPropagation();

    if (!isLoggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/items/${listingId}`)}`);
      return;
    }
    if (disabled) return;

    startTransition(async () => {
      setOptimistic(!optimistic.favorited);
      const result = await toggleFavorite(listingId);
      if (!result.ok) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  const label = optimistic.favorited ? "お気に入りから削除" : "お気に入りに追加";
  // 商品名が渡されていれば読み上げで区別できるようにする
  const iconLabel = listingTitle ? `${listingTitle} を${label}` : label;

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={optimistic.favorited}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors",
          optimistic.favorited
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : "hover:bg-accent",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <Heart className={cn("size-4", optimistic.favorited && "fill-current")} aria-hidden />
        {label}
        {count !== undefined && (
          <span className="tabular-nums text-muted-foreground">{optimistic.count}</span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={iconLabel}
      aria-pressed={optimistic.favorited}
      className={cn(
        "flex size-11 items-center justify-center rounded-full bg-background/85 backdrop-blur transition-colors",
        disabled ? "cursor-not-allowed opacity-40" : "hover:bg-background",
        className,
      )}
    >
      <Heart
        className={cn(
          "size-5",
          optimistic.favorited ? "fill-destructive text-destructive" : "text-muted-foreground",
        )}
        aria-hidden
      />
    </button>
  );
}
