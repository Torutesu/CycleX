"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { login } from "@/features/auth/actions";
import type { ActionResult } from "@/lib/errors";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<ActionResult<undefined> | null, FormData>(login, null);

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
          className="h-11"
          required
        />
      </Field>

      <Field id="password" label="パスワード" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="h-11"
          required
        />
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
