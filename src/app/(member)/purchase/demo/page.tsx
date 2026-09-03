import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getTransactionDetail } from "@/features/transaction/queries";
import { isDemoCheckout } from "@/lib/demo";
import { listingImageUrl } from "@/lib/images";
import { formatPrice } from "@/lib/utils";
import { DemoPaymentActions } from "@/features/transaction/components/demo-payment-actions";

export const metadata: Metadata = { title: "デモ決済" };

/**
 * Stripe を構成する前に、購入から取引完了までを通しで確認するための画面。
 * 実際の決済は行わない。確定処理は本物の Webhook と同じ関数を通す。
 */
export default async function DemoPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ tx?: string }>;
}) {
  if (!isDemoCheckout()) notFound();

  const { tx } = await searchParams;
  const user = await requireUser("/mypage/purchases");
  if (!tx) notFound();

  const transaction = await getTransactionDetail(tx, user.id);
  if (!transaction || transaction.buyerId !== user.id) notFound();

  // すでに支払い済みなら結果画面へ送る
  if (transaction.status !== "pending_payment") {
    redirect(`/purchase/complete?tx=${transaction.id}`);
  }

  const thumbnail = transaction.listing.thumbnailPath;

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="flex items-start gap-3 rounded-xl border border-dashed border-amber-500/60 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-bold">これはデモ用の決済画面です</p>
          <p className="mt-1 text-sm">
            実際の支払いは発生しません。動作確認のために、支払いが完了した状態を再現します。
          </p>
        </div>
      </div>

      <h1 className="mt-6 text-xl font-bold">お支払い(デモ)</h1>

      <div className="mt-4 rounded-xl border bg-card p-4">
        <div className="flex gap-3">
          {thumbnail && (
            <Image
              src={listingImageUrl(thumbnail)}
              alt=""
              width={72}
              height={72}
              className="size-18 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="break-phrase text-sm font-medium leading-snug">{transaction.listing.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              出品者: {transaction.counterparty.displayName}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-baseline justify-between border-t pt-4">
          <span className="font-bold">お支払い金額</span>
          <span className="text-xl font-bold tabular-nums">{formatPrice(transaction.price)}</span>
        </div>
      </div>

      <DemoPaymentActions transactionId={transaction.id} amount={formatPrice(transaction.price)} />
    </div>
  );
}
