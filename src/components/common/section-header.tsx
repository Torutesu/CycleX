import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  title: string;
  /** 見出しの下に置く一言。無くてもよい */
  description?: string;
  /** 一覧へ送る導線 */
  href?: string;
  linkLabel?: string;
  className?: string;
};

/**
 * 「見出し + すべて見る」の組。
 * 画面ごとに書き分けると字の大きさと余白がずれるので、ここに集約する。
 */
export function SectionHeader({
  title,
  description,
  href,
  linkLabel = "すべて見る",
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-bold md:text-lg">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="inline-flex min-h-11 shrink-0 items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {linkLabel}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}
