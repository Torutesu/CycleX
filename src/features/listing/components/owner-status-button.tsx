"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { republishListing, withdrawListing } from "@/features/listing/actions";
import { canRepublishListing, canWithdrawListing } from "@/features/listing/rules";
import type { ListingStatus } from "@/lib/constants";

/** FR-05: 商品詳細で出品者本人が取下げ / 再公開する */
export function OwnerStatusButton({
  listingId,
  status,
  className,
}: {
  listingId: string;
  status: ListingStatus;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const withdrawable = canWithdrawListing(status);
  const republishable = canRepublishListing(status);
  if (!withdrawable && !republishable) return null;

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "操作に失敗しました");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  return withdrawable ? (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={pending}
      onClick={() => run(() => withdrawListing(listingId), "取下げました")}
    >
      <EyeOff className="size-4" aria-hidden />
      取下げる
    </Button>
  ) : (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={pending}
      onClick={() => run(() => republishListing(listingId), "再公開しました")}
    >
      <Eye className="size-4" aria-hidden />
      再公開する
    </Button>
  );
}
