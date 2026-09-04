"use client";

import { useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openTransactionThread } from "@/features/message/actions";
import { cn } from "@/lib/utils";

/**
 * 取引画面から相手とのやり取りを開く。
 * スレッドが無ければ押されたときに作る(画面を開いただけでは作らない)。
 */
export function OpenThreadButton({
  transactionId,
  label = "メッセージを開く",
  variant = "outline",
  className,
}: {
  transactionId: string;
  label?: string;
  variant?: "default" | "outline";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={variant}
      className={cn("h-11", className)}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await openTransactionThread(transactionId);
          } catch (error) {
            // redirect() は例外で遷移するため、それ以外だけを拾う
            if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) return;
            toast.error("やり取りを開けませんでした。時間をおいて再度お試しください。");
          }
        })
      }
    >
      <MessageCircle className="size-4" aria-hidden />
      {pending ? "開いています..." : label}
    </Button>
  );
}
