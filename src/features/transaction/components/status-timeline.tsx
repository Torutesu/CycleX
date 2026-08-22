import { Check } from "lucide-react";
import type { TransactionStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "paid", label: "支払い" },
  { key: "shipped", label: "発送・受渡" },
  { key: "received", label: "受取確認" },
  { key: "completed", label: "取引完了" },
] as const;

/** 現在のステータスが何ステップ目まで到達しているか */
function reachedIndex(status: TransactionStatus): number {
  switch (status) {
    case "pending_payment":
      return -1;
    case "paid":
      return 0;
    case "shipped":
      return 1;
    case "received":
      return 2;
    case "completed":
      return 3;
    case "canceled":
      return -1;
  }
}

/** M-05: 取引の進行状況(FR-08) */
export function StatusTimeline({ status }: { status: TransactionStatus }) {
  if (status === "canceled") {
    return (
      <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        この取引はキャンセルされました
      </div>
    );
  }

  const reached = reachedIndex(status);

  return (
    <ol className="flex items-start">
      {STEPS.map((step, index) => {
        const done = index <= reached;
        const current = index === reached;

        return (
          <li key={step.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {/* 左側の接続線 */}
              <span
                className={cn(
                  "h-0.5 flex-1",
                  index === 0 ? "bg-transparent" : done ? "bg-primary" : "bg-border",
                )}
              />
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold tabular-nums",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground",
                  current && "ring-2 ring-primary/30",
                )}
              >
                {done ? <Check className="size-4" aria-hidden /> : index + 1}
              </span>
              <span
                className={cn(
                  "h-0.5 flex-1",
                  index === STEPS.length - 1
                    ? "bg-transparent"
                    : index < reached
                      ? "bg-primary"
                      : "bg-border",
                )}
              />
            </div>
            <span
              className={cn(
                "mt-1.5 text-center text-[11px] leading-tight",
                done ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
