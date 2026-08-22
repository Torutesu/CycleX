import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = {
  /** input の id と紐づける */
  id: string;
  label: string;
  required?: boolean;
  /** 補足説明 */
  hint?: ReactNode;
  /** サーバー/クライアント双方のエラーメッセージ */
  errors?: string[];
  className?: string;
  children: ReactNode;
};

/**
 * ラベル・補足・エラーをまとめて表示するフォーム項目のラッパー。
 * shadcn の Form(react-hook-form 前提)より軽量で、Server Action とも併用できる。
 */
export function Field({ id, label, required, hint, errors, className, children }: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const hasError = Boolean(errors && errors.length > 0);

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && (
          <span className="ml-1 text-xs font-normal text-destructive" aria-hidden>
            必須
          </span>
        )}
      </Label>
      {children}
      {hint && !hasError && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {hasError && (
        <ul id={errorId} className="space-y-0.5 text-xs text-destructive">
          {errors!.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
