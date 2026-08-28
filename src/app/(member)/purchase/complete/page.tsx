import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";
import { getTransactionDetail } from "@/features/transaction/queries";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = { title: "購入完了" };

/** 決済通知の反映を待つあいだ自動更新する回数の上限(5秒 × 24 = 約2分) */
const MAX_AUTO_RELOADS = 24;

export default async function PurchaseCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ tx?: string; wait?: string }>;
}) {
  const { tx, wait } = await searchParams;
  const user = await requireUser("/mypage/purchases");

  if (!tx) notFound();

  const transaction = await getTransactionDetail(tx, user.id);
  if (!transaction) notFound();

  // 決済確定は Webhook が行うため、戻り直後は反映待ちのことがある(FR-09)
  const pending = transaction.status === "pending_payment";

  // 通知が届かないまま延々とリロードし続けないよう、回数で打ち切る
  const reloads = Math.max(0, Number(wait) || 0);
  const keepWaiting = pending && reloads < MAX_AUTO_RELOADS;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      {/* 反映待ちのあいだは数秒ごとに再読み込みする(上限あり) */}
      {keepWaiting && (
        <meta
          httpEquiv="refresh"
          content={`5; url=/purchase/complete?tx=${transaction.id}&wait=${reloads + 1}`}
        />
      )}

      {pending ? (
        <>
          {keepWaiting ? (
            <Loader2 className="size-12 animate-spin text-primary" aria-hidden />
          ) : null}
          <h1 className="mt-4 text-xl font-bold">
            {keepWaiting ? "決済を確認しています" : "決済の確認に時間がかかっています"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {keepWaiting
              ? "決済代行サービスからの通知を待っています。この画面は自動で更新されます。"
              : "お支払いが完了していれば、取引画面に反映されます。反映されない場合は、お手数ですが運営までお問い合わせください。"}
          </p>
        </>
      ) : transaction.status === "canceled" ? (
        <>
          <h1 className="text-xl font-bold">お支払いは完了していません</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            決済が中断されたか、有効期限が切れました。商品ページからもう一度お試しください。
          </p>
          <Button asChild className="mt-8 h-11 w-full">
            <Link href={`/items/${transaction.listing.id}`}>商品ページへ</Link>
          </Button>
        </>
      ) : (
        <>
          <CheckCircle2 className="size-12 text-primary" aria-hidden />
          <h1 className="mt-4 text-xl font-bold">ご購入ありがとうございます</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {transaction.listing.title}
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums">{formatPrice(transaction.price)}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            出品者からの発送・受渡のご連絡をお待ちください。
            やり取りは取引画面から行えます。
          </p>
          <Button asChild className="mt-8 h-11 w-full">
            <Link href={`/transactions/${transaction.id}`}>取引画面へ</Link>
          </Button>
        </>
      )}

      <Button asChild variant="ghost" className="mt-3 h-11 w-full">
        <Link href="/mypage/purchases">購入した取引の一覧</Link>
      </Button>
    </div>
  );
}
