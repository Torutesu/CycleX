"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startPurchase } from "@/features/transaction/actions";
import { formatPrice } from "@/lib/utils";

type Props = {
  listingId: string;
  price: number | null;
  disabled?: boolean;
};

/** M-03: 「支払いへ進む」。成功時は Stripe Checkout へリダイレクトされる。 */
export function PurchaseButton({ listingId, price, disabled }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      className="h-12 w-full"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startPurchase(listingId);
          // 成功時は redirect されるため、ここに来るのは失敗時のみ
          if (result && !result.ok) toast.error(result.error);
        })
      }
    >
      <CreditCard className="size-4" aria-hidden />
      {pending ? "決済ページへ移動中..." : `${formatPrice(price)} を支払う`}
    </Button>
  );
}
