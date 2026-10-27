"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/form/submit-button";
import { submitReport } from "@/features/report/actions";
import { REPORT_DETAIL_MAX, reportReasonsFor, type ReportTargetType } from "@/lib/constants";

/** 対象ごとの文言。取引は「通報」ではなく、当事者からの「申告」として受け付ける */
const COPY: Record<
  ReportTargetType,
  { trigger: string; title: string; description: string; submit: string; done: string }
> = {
  listing: {
    trigger: "この商品を通報する",
    title: "商品の通報",
    description: "運営で内容を確認します。通報したことが相手に伝わることはありません。",
    submit: "通報する",
    done: "通報を受け付けました。運営で内容を確認します。",
  },
  user: {
    trigger: "この利用者を通報する",
    title: "利用者の通報",
    description: "運営で内容を確認します。通報したことが相手に伝わることはありません。",
    submit: "通報する",
    done: "通報を受け付けました。運営で内容を確認します。",
  },
  transaction: {
    trigger: "取引の問題を運営に申告する",
    title: "取引の問題を申告",
    description: "運営が取引の内容とメッセージを確認し、必要に応じて取引の当事者にご連絡します。",
    submit: "申告する",
    done: "申告を受け付けました。運営で内容を確認します。",
  },
};

type Props = {
  targetType: ReportTargetType;
  targetId: string;
  /** 未ログインならログイン画面へ誘導する */
  isLoggedIn: boolean;
  /** ログイン後に戻る先 */
  returnTo: string;
  className?: string;
};

/** FR-11: 商品・利用者の通報と、取引の問題の申告のフォーム */
export function ReportDialog({ targetType, targetId, isLoggedIn, returnTo, className }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[targetType];

  async function handleSubmit(formData: FormData) {
    const result = await submitReport(null, formData);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setOpen(false);
    setReason("");
    toast.success(copy.done);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!isLoggedIn) {
            router.push(`/login?next=${encodeURIComponent(returnTo)}`);
            return;
          }
          setOpen(true);
        }}
        className={
          className ??
          "inline-flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:underline"
        }
      >
        <Flag className="size-3.5" aria-hidden />
        {copy.trigger}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>

          <form action={handleSubmit} className="space-y-5">
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <fieldset>
              <legend className="text-sm font-medium">
                理由
                <span className="ml-1 text-xs font-normal text-destructive">必須</span>
              </legend>
              <RadioGroup
                name="reason"
                value={reason}
                onValueChange={setReason}
                className="mt-2 gap-0"
              >
                {reportReasonsFor(targetType).map((option) => (
                  <div key={option.value} className="flex min-h-11 items-center gap-2.5">
                    <RadioGroupItem value={option.value} id={`reason-${option.value}`} />
                    <Label
                      htmlFor={`reason-${option.value}`}
                      className="flex-1 cursor-pointer text-sm font-normal"
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="report-detail" className="text-sm font-medium">
                詳細(任意)
              </Label>
              <Textarea
                id="report-detail"
                name="detail"
                rows={4}
                maxLength={REPORT_DETAIL_MAX}
                placeholder="具体的な内容をご記入ください。"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => setOpen(false)}
              >
                キャンセル
              </Button>
              <SubmitButton
                variant="destructive"
                className="h-11"
                disabled={!reason}
                pendingLabel="送信中..."
              >
                {copy.submit}
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
