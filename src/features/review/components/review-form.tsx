"use client";

import { useActionState, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { submitReview } from "@/features/review/actions";
import { REVIEW_COMMENT_MAX } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/errors";

const RATING_LABELS = ["", "とても悪い", "悪い", "ふつう", "良い", "とても良い"] as const;

/** M-06: ★1〜5 + コメント(FR-10) */
export function ReviewForm({ transactionId }: { transactionId: string }) {
  const [rating, setRating] = useState(0);
  const [state, formAction] = useActionState<ActionResult<undefined> | null, FormData>(
    submitReview,
    null,
  );

  // 成功したときはサーバー側で取引画面へ移動するため、ここでは失敗だけ拾う
  useEffect(() => {
    if (state && !state.ok) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="transactionId" value={transactionId} />
      <input type="hidden" name="rating" value={rating} />

      {state && !state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <fieldset>
        <legend className="text-sm font-medium">
          評価
          <span className="ml-1 text-xs font-normal text-destructive">必須</span>
        </legend>
        <div className="mt-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={`${value} / 5`}
              aria-pressed={rating === value}
              className="flex size-12 items-center justify-center rounded-md transition-transform hover:scale-110"
            >
              <Star
                className={cn(
                  "size-8",
                  value <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                )}
                aria-hidden
              />
            </button>
          ))}
        </div>
        <p className="mt-1 h-5 text-sm text-muted-foreground">
          {rating > 0 ? RATING_LABELS[rating] : "星を選択してください"}
        </p>
      </fieldset>

      <Field
        id="comment"
        label="コメント"
        hint={`取引の様子や商品の状態など(${REVIEW_COMMENT_MAX}文字以内・任意)`}
      >
        <Textarea
          id="comment"
          name="comment"
          rows={5}
          maxLength={REVIEW_COMMENT_MAX}
          placeholder="例: 梱包も丁寧で、状態も説明どおりでした。ありがとうございました。"
        />
      </Field>

      <SubmitButton className="h-12 w-full" disabled={rating === 0} pendingLabel="送信中...">
        評価を登録する
      </SubmitButton>
    </form>
  );
}
