import { cloneElement, isValidElement, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * `Field` が入力要素へ渡す ARIA 属性。
 *
 * 直下が Radix の `Select` のように DOM を持たないコンポーネントだと
 * `cloneElement` で渡しても捨てられてしまうため、
 * 呼び出し側が実体(`SelectTrigger` など)へ自分で広げられるようにする。
 */
export type FieldControlProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};

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
  /**
   * 入力要素。関数を渡すと ARIA 属性を受け取れる。
   * `input` / `textarea` のように直下が DOM 要素なら、そのまま渡せば自動で付く。
   */
  children: ReactNode | ((control: FieldControlProps) => ReactNode);
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
  const controlProps: FieldControlProps = {
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    ...(hasError ? { "aria-invalid": true as const } : {}),
    ...(required ? { "aria-required": true as const } : {}),
  };

  const control =
    typeof children === "function"
      ? children(controlProps)
      : isValidElement<Record<string, unknown>>(children)
        ? cloneElement(children, controlProps)
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
