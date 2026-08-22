import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireUser } from "@/lib/session";
import { getTransactionDetail } from "@/features/transaction/queries";
import { canSubmitReview } from "@/features/review/rules";
import { ReviewForm } from "@/features/review/components/review-form";

export const metadata: Metadata = { title: "取引相手の評価" };

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/transactions/${id}/review`);

  const transaction = await getTransactionDetail(id, user.id);
  if (!transaction) notFound();

  const check = canSubmitReview(transaction.status, true, transaction.hasReviewed);

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <Link
        href={`/transactions/${id}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        取引画面へ戻る
      </Link>

      <h1 className="text-xl font-bold">取引相手の評価</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {transaction.counterparty.displayName} さんとの取引はいかがでしたか。
      </p>

      {!check.allowed ? (
        <Alert className="mt-6">
          <AlertDescription>{check.reason}</AlertDescription>
        </Alert>
      ) : (
        <div className="mt-6">
          <ReviewForm transactionId={transaction.id} />
        </div>
      )}

      <p className="mt-6 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        評価は双方が登録した時点で公開されます。相手の評価内容は、それまで確認できません。
        一度登録した評価は変更・削除できません。
      </p>
    </div>
  );
}
