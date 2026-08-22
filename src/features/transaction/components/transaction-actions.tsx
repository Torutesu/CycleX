"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { markReceived, markShipped } from "@/features/transaction/actions";
import { SHIPPING_NOTE_MAX } from "@/lib/constants";
import type { ActionResult } from "@/lib/errors";

/** 出品者の「発送・受渡連絡」フォーム */
export function ShipForm({
  transactionId,
  deliveryMethod,
}: {
  transactionId: string;
  deliveryMethod: string | null;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult<undefined> | null, FormData>(
    markShipped,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("発送・受渡の連絡を送信しました");
      router.refresh();
    }
  }, [state, router]);

  const isInPerson = deliveryMethod === "in_person";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="transactionId" value={transactionId} />

      {state && !state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Field
        id="shipping-note"
        label="連絡メモ"
        hint={
          isInPerson
            ? "待ち合わせ場所や日時をお伝えください(任意)"
            : "追跡番号や配送業者などをお伝えください(任意)"
        }
      >
        <Textarea
          id="shipping-note"
          name="note"
          rows={3}
          maxLength={SHIPPING_NOTE_MAX}
          placeholder={
            isInPerson
              ? "例: 今週土曜10時に◯◯駅東口でいかがでしょうか。"
              : "例: ヤマト運輸 1234-5678-9012 で発送しました。"
          }
        />
      </Field>

      <SubmitButton className="h-12 w-full" pendingLabel="送信中...">
        <Truck className="size-4" aria-hidden />
        {isInPerson ? "受渡の連絡をする" : "発送を連絡する"}
      </SubmitButton>
    </form>
  );
}

/** 購入者の「受け取りました」確認 */
export function ReceiveButton({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button type="button" className="h-12 w-full" onClick={() => setOpen(true)}>
        <PackageCheck className="size-4" aria-hidden />
        受け取りました
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>受取を確認しますか?</DialogTitle>
            <DialogDescription>
              商品の状態をご確認のうえ操作してください。受取確認後は取り消せません。
              確認すると、双方で評価を登録できるようになります。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button
              className="h-11"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await markReceived(transactionId);
                  setOpen(false);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("受取を確認しました");
                  router.refresh();
                })
              }
            >
              受取を確認する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
