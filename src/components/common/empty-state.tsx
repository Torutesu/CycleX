import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  /** 次に何をすればよいかの一言 */
  description?: string;
  /** 次の行動へのボタンなど */
  action?: ReactNode;
  className?: string;
};

/**
 * 一覧が空のときの表示。
 *
 * 「ありません」だけで終わらせず、次に何をすればよいかまで示す。
 * 画面ごとにばらつくと同じサービスに見えないので、形をここに集約する。
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-16 text-center", className)}>
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-4 font-medium">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
