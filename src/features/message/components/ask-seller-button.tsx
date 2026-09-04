"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/form/submit-button";
import { startThread } from "@/features/message/actions";
import { MESSAGE_MAX } from "@/lib/constants";
import type { ActionResult } from "@/lib/errors";

type Props = {
  listingId: string;
  sellerName: string;
  isLoggedIn: boolean;
  /** 既にやり取りがある場合はそのスレッドへ直接遷移する */
  existingThreadId: string | null;
  /** スマホの固定バー用にアイコンのみで表示する */
  iconOnly?: boolean;
  className?: string;
};

/** FR-07: 商品詳細の「出品者に質問」 */
export function AskSellerButton({
  listingId,
  sellerName,
  isLoggedIn,
  existingThreadId,
  iconOnly = false,
  className,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionResult<{ threadId: string }> | null, FormData>(
    startThread,
    null,
  );

  useEffect(() => {
    if (state && !state.ok) toast.error(state.error);
  }, [state]);

  function handleClick() {
    if (!isLoggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/items/${listingId}`)}`);
      return;
    }
    if (existingThreadId) {
      router.push(`/messages/${existingThreadId}`);
      return;
    }
    setOpen(true);
  }

  const label = existingThreadId ? "やり取りを開く" : "出品者に質問";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={iconOnly ? "icon" : "default"}
        className={className}
        onClick={handleClick}
        aria-label={iconOnly ? label : undefined}
      >
        <MessageCircle className="size-4" aria-hidden />
        {!iconOnly && label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sellerName} さんに質問する</DialogTitle>
            <DialogDescription>
              商品の状態や受渡方法など、気になる点をお尋ねください。やり取りは当事者だけが閲覧できます。
            </DialogDescription>
          </DialogHeader>

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="listingId" value={listingId} />
            <Textarea
              name="body"
              rows={5}
              maxLength={MESSAGE_MAX}
              required
              placeholder="例: フレームサイズの実寸を教えていただけますか?"
              aria-label="質問の内容"
            />
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => setOpen(false)}
              >
                キャンセル
              </Button>
              <SubmitButton className="h-11" pendingLabel="送信中...">
                送信する
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
