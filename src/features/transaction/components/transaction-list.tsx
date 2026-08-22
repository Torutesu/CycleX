import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { listingImageUrl } from "@/lib/images";
import { formatPrice, formatDate } from "@/lib/utils";
import { TRANSACTION_STATUSES, labelOf } from "@/lib/constants";
import type { TransactionListItem } from "@/features/transaction/queries";

/** 取引履歴の行リスト(M-11) */
export function TransactionList({ transactions }: { transactions: TransactionListItem[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {transactions.map((transaction) => (
        <li key={transaction.id}>
          <Link
            href={`/transactions/${transaction.id}`}
            className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/40"
          >
            <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted">
              {transaction.listing.thumbnailPath ? (
                <Image
                  src={listingImageUrl(transaction.listing.thumbnailPath)}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                  画像なし
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">{transaction.listing.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="tabular-nums">{formatPrice(transaction.price)}</span>
                <span>
                  {transaction.role === "buyer" ? "出品者" : "購入者"}:{" "}
                  {transaction.counterparty.displayName}
                </span>
                <span>{formatDate(transaction.createdAt)}</span>
              </div>
            </div>

            <Badge
              variant={
                transaction.status === "canceled"
                  ? "destructive"
                  : transaction.status === "completed"
                    ? "secondary"
                    : "default"
              }
              className="shrink-0"
            >
              {labelOf(TRANSACTION_STATUSES, transaction.status)}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
