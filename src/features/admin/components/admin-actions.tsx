"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import type { ActionResult } from "@/lib/errors";

type ServerFormAction = (
  prev: ActionResult<undefined> | null,
  formData: FormData,
) => Promise<ActionResult<undefined>>;

type ReasonDialogProps = {
  /** ダイアログを開くボタンの文言 */
  trigger: string;
  title: string;
  description: string;
  /** 理由入力欄のラベル */
  reasonLabel: string;
  reasonName?: string;
  reasonRequired?: boolean;
  /** 隠しフィールド(対象 ID など) */
  hidden: Record<string, string>;
  action: ServerFormAction;
  successMessage: string;
  variant?: "destructive" | "outline";
  /** 追加の注意書き */
  warning?: string;
};

/**
 * 理由を入力して実行する管理操作の共通ダイアログ。
 * 非表示化・利用停止・取引キャンセル・通報対応で使う。
 */
export function ReasonDialog({
  trigger,
  title,
  description,
  reasonLabel,
  reasonName = "reason",
  reasonRequired = false,
  hidden,
  action,
  successMessage,
  variant = "destructive",
  warning,
}: ReasonDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // useActionState + useEffect ではなくフォームアクション内で完結させ、
  // 成功時のダイアログ閉じと再取得をその場で行う
  async function handleSubmit(formData: FormData) {
    const result = await action(null, formData);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setOpen(false);
    toast.success(successMessage);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant={variant} size="sm" className="h-11" onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {warning && (
            <Alert>
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`dialog-${reasonName}`} className="text-sm font-medium">
              {reasonLabel}
              {reasonRequired && (
                <span className="ml-1 text-xs font-normal text-destructive">必須</span>
              )}
            </Label>
            <Textarea
              id={`dialog-${reasonName}`}
              name={reasonName}
              rows={3}
              maxLength={500}
              required={reasonRequired}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <SubmitButton variant={variant} className="h-11" pendingLabel="実行中...">
              {trigger}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 理由入力の要らない単純な実行ボタン(解除操作など) */
export function ConfirmButton({
  label,
  confirmTitle,
  confirmDescription,
  onConfirm,
  successMessage,
  variant = "outline",
}: {
  label: string;
  confirmTitle: string;
  confirmDescription: string;
  onConfirm: () => Promise<ActionResult<undefined>>;
  successMessage: string;
  variant?: "default" | "outline" | "destructive";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant={variant} size="sm" className="h-11" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirmTitle}</DialogTitle>
          <DialogDescription>{confirmDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
            キャンセル
          </Button>
          <Button
            variant={variant === "outline" ? "default" : variant}
            className="h-11"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await onConfirm();
                setOpen(false);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(successMessage);
                router.refresh();
              })
            }
          >
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
