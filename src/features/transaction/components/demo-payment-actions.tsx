"use client";

import { useState, useTransition } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { completeDemoPayment, cancelDemoPayment } from "@/features/transaction/demo-actions";

/** デモ決済の確定・取消。押し間違いを防ぐため、確定は二段階にする */
export function DemoPaymentActions({
  transactionId,
  amount,
}: {
  transactionId: string;
  amount: string;
}) {
  const [pending, startTransition] = useTransition();
  const [canceling, setCanceling] = useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string } | void>, canceled: boolean) {
    setCanceling(canceled);
    startTransition(async () => {
      const result = await action();
      // 成功時はサーバー側で遷移するため、戻ってくるのは失敗したときだけ
      if (result && !result.ok && result.error) toast.error(result.error);
    });
  }

  return (
    <div className="mt-6 space-y-3">
      <Button
        className="h-12 w-full"
        disabled={pending}
        onClick={() => run(() => completeDemoPayment(transactionId), false)}
      >
        <CreditCard className="size-4" aria-hidden />
        {pending && !canceling ? "処理中..." : `${amount} を支払う(デモ)`}
      </Button>
      <Button
        variant="outline"
        className="h-11 w-full"
        disabled={pending}
        onClick={() => run(() => cancelDemoPayment(transactionId), true)}
      >
        {pending && canceling ? "取消中..." : "支払いをやめる"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        カード情報の入力はありません。Stripe
        を設定すると、この画面は本物の決済ページに切り替わります。
      </p>
    </div>
  );
}
