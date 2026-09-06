"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field } from "@/components/form/field";
import { PasswordInput } from "@/components/form/password-input";
import { SubmitButton } from "@/components/form/submit-button";
import { login } from "@/features/auth/actions";
import type { ActionResult } from "@/lib/errors";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<ActionResult<undefined> | null, FormData>(login, null);
  // 送信が終わると素の入力欄は空に戻る。パスワードを打ち間違えるたびに
  // メールアドレスまで入れ直しになるので、ここだけは値を持っておく。
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}

      {state && !state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Field id="email" label="メールアドレス" required>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11"
          required
        />
      </Field>

      <Field id="password" label="パスワード" required>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </Field>

      <div className="text-right">
        <Link
          href="/reset-password"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          パスワードをお忘れですか?
        </Link>
      </div>

      <SubmitButton className="h-11 w-full" pendingLabel="ログイン中...">
        ログイン
      </SubmitButton>
    </form>
  );
}
