import { TriangleAlert } from "lucide-react";
import { isDemoCheckout } from "@/lib/demo";

/**
 * デモ決済が有効なときに全ページの先頭へ出す帯。
 * 実際の支払いが発生しない環境であることを、購入前に必ず目に入る位置で伝える。
 */
export function DemoBanner() {
  if (!isDemoCheckout()) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
      <span>デモ環境です。実際の支払いは発生しません。</span>
    </div>
  );
}
