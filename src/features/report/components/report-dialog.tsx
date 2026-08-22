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
import { REPORT_DETAIL_MAX, REPORT_REASONS } from "@/lib/constants";

type Props = {
  targetType: "listing" | "user";
  targetId: string;
  /** 未ログインならログイン画面へ誘導する */
  isLoggedIn: boolean;
  /** ログイン後に戻る先 */
  returnTo: string;
  className?: string;
};

/** FR-11: 商品・利用者の通報フォーム */
export function ReportDialog({ targetType, targetId, isLoggedIn, returnTo, className }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    const result = await submitReport(null, formData);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setOpen(false);
    setReason("");
    toast.success("通報を受け付けました。運営で内容を確認します。");
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
        {targetType === "listing" ? "この商品を通報する" : "この利用者を通報する"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {targetType === "listing" ? "商品の通報" : "利用者の通報"}
            </DialogTitle>
            <DialogDescription>
              運営で内容を確認します。通報したことが相手に伝わることはありません。
            </DialogDescription>
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
                {REPORT_REASONS.map((option) => (
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
              <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(false)}>
                キャンセル
              </Button>
              <SubmitButton variant="destructive" className="h-11" disabled={!reason} pendingLabel="送信中...">
                通報する
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
