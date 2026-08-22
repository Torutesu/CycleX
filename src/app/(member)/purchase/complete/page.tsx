import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";
import { getTransactionDetail } from "@/features/transaction/queries";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = { title: "購入完了" };

export default async function PurchaseCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ tx?: string }>;
}) {
  const { tx } = await searchParams;
  const user = await requireUser("/mypage/purchases");

  if (!tx) notFound();

  const transaction = await getTransactionDetail(tx, user.id);
  if (!transaction) notFound();

  // 決済確定は Webhook が行うため、戻り直後は反映待ちのことがある(FR-09)
  const pending = transaction.status === "pending_payment";

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      {/* 反映待ちのあいだは数秒ごとに再読み込みする */}
      {pending && <meta httpEquiv="refresh" content="5" />}

      {pending ? (
        <>
          <Loader2 className="size-12 animate-spin text-primary" aria-hidden />
          <h1 className="mt-4 text-xl font-bold">決済を確認しています</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            決済代行サービスからの通知を待っています。この画面は自動で更新されます。
            数分経っても変わらない場合は、取引画面からご確認ください。
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
