import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChevronLeft, Star } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/session";
import { getTransactionDetail } from "@/features/transaction/queries";
import { OpenThreadButton } from "@/features/message/components/open-thread-button";
import { nextActionFor, describeCancelReason } from "@/features/transaction/state";
import { waitingNotice } from "@/features/transaction/guidance";
import { StatusTimeline } from "@/features/transaction/components/status-timeline";
import { ShipForm, ReceiveButton } from "@/features/transaction/components/transaction-actions";
import { avatarImageUrl, listingImageUrl } from "@/lib/images";
import { formatPrice, formatDateTime } from "@/lib/utils";
import { TRANSACTION_STATUSES, labelOf } from "@/lib/constants";

export const metadata: Metadata = { title: "取引画面" };

export default async function TransactionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reviewed?: string }>;
}) {
  const { id } = await params;
  const { reviewed } = await searchParams;
  const user = await requireUser(`/transactions/${id}`);

  const transaction = await getTransactionDetail(id, user.id);
  if (!transaction) notFound();

  const role: "buyer" | "seller" = transaction.buyerId === user.id ? "buyer" : "seller";
  const action = nextActionFor(transaction.status, role, transaction.hasReviewed);
  const notice = waitingNotice(
    transaction.status,
    role,
    transaction.listing.deliveryMethod,
    transaction.hasReviewed,
  );
  const avatarSrc = avatarImageUrl(transaction.counterparty.avatarUrl);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href={role === "seller" ? "/mypage/sales" : "/mypage/purchases"}
        className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {role === "seller" ? "販売した取引へ戻る" : "購入した取引へ戻る"}
      </Link>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">取引画面</h1>
        <Badge variant={transaction.status === "canceled" ? "destructive" : "secondary"}>
          {labelOf(TRANSACTION_STATUSES, transaction.status)}
        </Badge>
      </div>

      {/* 評価の登録直後。移動先で結果が分かるようにする */}
      {reviewed === "1" && (
        <Alert className="mt-4">
          <AlertDescription>
            評価を登録しました。相手の評価は、双方がそろった時点で公開されます。
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-6">
        <StatusTimeline status={transaction.status} />
      </div>

      {/* 次のアクション */}
      <section className="mt-8 rounded-xl border bg-card p-4">
        {action === "pay" && (
          <>
            <h2 className="text-base font-semibold">お支払いが完了していません</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              決済が中断されたか、確認中の可能性があります。しばらく待っても変わらない場合は、
              商品ページからもう一度購入手続きをお試しください。
            </p>
            <Button asChild variant="outline" className="mt-4 h-12 w-full">
              <Link href={`/items/${transaction.listing.id}`}>商品ページへ</Link>
            </Button>
          </>
        )}

        {action === "ship" && (
          <>
            <h2 className="text-base font-semibold">
              {transaction.listing.deliveryMethod === "in_person"
                ? "受渡の連絡をしてください"
                : "商品を発送してください"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {transaction.listing.deliveryMethod === "in_person"
                ? "お支払いが完了しています。購入者と待ち合わせのご相談をしてから、ご連絡ください。"
                : "お支払いが完了しています。購入者からメッセージでお届け先が届いたら、発送してご連絡ください。"}
            </p>
            <div className="mt-4">
              <ShipForm
                transactionId={transaction.id}
                deliveryMethod={transaction.listing.deliveryMethod}
              />
            </div>
          </>
        )}

        {action === "receive" && (
          <>
            <h2 className="text-base font-semibold">商品を受け取ったら確認してください</h2>
            {transaction.shippingNote && (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">
                {transaction.shippingNote}
              </p>
            )}
            <div className="mt-4">
              <ReceiveButton transactionId={transaction.id} />
            </div>
          </>
        )}

        {action === "review" && (
          <>
            <h2 className="text-base font-semibold">取引相手を評価してください</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              評価は双方が登録した時点で公開されます。
            </p>
            <Button asChild className="mt-4 h-12 w-full">
              <Link href={`/transactions/${transaction.id}/review`}>
                <Star className="size-4" aria-hidden />
                評価を登録する
              </Link>
            </Button>
          </>
        )}

        {action === "wait" && (
          <>
            <h2 className="text-base font-semibold">{notice.title}</h2>
            {notice.detail && <p className="mt-1 text-sm text-muted-foreground">{notice.detail}</p>}
            {notice.showMessageLink && (
              <OpenThreadButton
                transactionId={transaction.id}
                variant="default"
                className="mt-4 h-12 w-full"
              />
            )}
            {transaction.shippingNote && role === "seller" && (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">
                {transaction.shippingNote}
              </p>
            )}
          </>
        )}

        {action === null && (
          <>
            <h2 className="text-base font-semibold">
              {transaction.status === "completed"
                ? "取引が完了しました"
                : "取引はキャンセルされました"}
            </h2>
            {transaction.status === "canceled" && transaction.canceledReason && (
              <p className="mt-2 text-sm text-muted-foreground">
                理由: {describeCancelReason(transaction.canceledReason)}
              </p>
            )}
            {transaction.status === "completed" && !transaction.hasReviewed && (
              <Button asChild variant="outline" className="mt-4 h-11 w-full">
                <Link href={`/transactions/${transaction.id}/review`}>評価を登録する</Link>
              </Button>
            )}
          </>
        )}
      </section>

      {/* 商品 */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">取引中の商品</h2>
        <Link
          href={`/items/${transaction.listing.id}`}
          className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/40"
        >
          {transaction.listing.thumbnailPath && (
            <Image
              src={listingImageUrl(transaction.listing.thumbnailPath)}
              alt=""
              width={64}
              height={64}
              className="size-16 shrink-0 rounded-md object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 break-phrase text-sm font-medium">
              {transaction.listing.title}
            </p>
            <p className="mt-1 font-bold tabular-nums">{formatPrice(transaction.price)}</p>
          </div>
        </Link>
      </section>

      {/* 相手 */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">{role === "buyer" ? "出品者" : "購入者"}</h2>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <Link href={`/users/${transaction.counterparty.id}`} className="shrink-0">
            {avatarSrc ? (
              <Image
                src={avatarSrc}
                alt=""
                width={44}
                height={44}
                className="size-11 rounded-full object-cover"
              />
            ) : (
              <Avatar className="size-11">
                <AvatarFallback>{transaction.counterparty.displayName.slice(0, 1)}</AvatarFallback>
              </Avatar>
            )}
          </Link>
          <Link
            href={`/users/${transaction.counterparty.id}`}
            className="min-w-0 flex-1 text-sm font-medium hover:underline"
          >
            {transaction.counterparty.displayName}
          </Link>
          <OpenThreadButton transactionId={transaction.id} label="メッセージ" />
        </div>
      </section>

      <Separator className="my-8" />

      {/* 履歴 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">取引の記録</h2>
        <dl className="space-y-2 text-sm">
          <HistoryRow label="購入手続き" value={transaction.createdAt} />
          <HistoryRow label="支払い完了" value={transaction.paidAt} />
          <HistoryRow
            label={transaction.listing.deliveryMethod === "in_person" ? "受渡連絡" : "発送連絡"}
            value={transaction.shippedAt}
          />
          <HistoryRow label="受取確認" value={transaction.receivedAt} />
          <HistoryRow label="取引完了" value={transaction.completedAt} />
          <HistoryRow label="キャンセル" value={transaction.canceledAt} />
        </dl>
      </section>
    </div>
  );
}

function HistoryRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{formatDateTime(value)}</dd>
    </div>
  );
}
