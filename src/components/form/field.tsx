import { cloneElement, isValidElement, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = {
  /** input の id と紐づける */
  id: string;
  label: string;
  required?: boolean;
  /** 補足説明 */
  hint?: ReactNode;
  /** 入力済みの文字数。上限に近づいたことを打ちながら把握できるようにする */
  counter?: { value: number; max: number };
  /** サーバー/クライアント双方のエラーメッセージ */
  errors?: string[];
  className?: string;
  children: ReactNode;
};

/**
 * ラベル・補足・エラーをまとめて表示するフォーム項目のラッパー。
 * shadcn の Form(react-hook-form 前提)より軽量で、Server Action とも併用できる。
 */
export function Field({
  id,
  label,
  required,
  hint,
  counter,
  errors,
  className,
  children,
}: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const hasError = Boolean(errors && errors.length > 0);

  // 直下が 1 つの入力要素なら、補足とエラーを読み上げに結び付ける
  const describedBy = [hint && !hasError ? hintId : null, hasError ? errorId : null]
    .filter(Boolean)
    .join(" ");
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, {
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(hasError ? { "aria-invalid": true } : {}),
        ...(required ? { "aria-required": true } : {}),
      })
    : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
          {required && (
            <span className="ml-1 text-xs font-normal text-destructive" aria-hidden>
              必須
            </span>
          )}
        </Label>
        {counter && (
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums",
              counter.value > counter.max ? "text-destructive" : "text-muted-foreground",
            )}
            aria-hidden
          >
            {counter.value} / {counter.max}
          </span>
        )}
      </div>
      {control}
      {hint && !hasError && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {hasError && (
        <ul id={errorId} role="alert" className="space-y-0.5 text-xs text-destructive">
          {errors!.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
