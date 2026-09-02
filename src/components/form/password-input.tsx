"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  className?: string;
};

/**
 * 表示の切り替えができるパスワード入力。
 *
 * スマホでは打ち間違いに気づけず、ログインできない原因が
 * パスワードなのか入力ミスなのか利用者に分からない。
 * 端末を他人に見られる場面もあるため、既定は伏せ字のまま。
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const hintId = useId();

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("h-11 pr-12", className)}
        aria-describedby={props["aria-describedby"] ?? hintId}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-pressed={visible}
        aria-label={visible ? "パスワードを隠す" : "パスワードを表示する"}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? (
          <EyeOff className="size-5" aria-hidden />
        ) : (
          <Eye className="size-5" aria-hidden />
        )}
      </button>
      <span id={hintId} className="sr-only">
        {visible ? "パスワードが表示されています" : "パスワードは伏せ字で入力されます"}
      </span>
    </div>
  );
}
