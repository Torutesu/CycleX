"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { updatePassword } from "@/features/auth/actions";
import type { ActionResult } from "@/lib/errors";

export function ResetUpdateForm() {
  const [state, formAction] = useActionState<ActionResult<undefined> | null, FormData>(
    updatePassword,
    null,
  );
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>パスワードを変更しました。</AlertDescription>
        </Alert>
        <Button asChild className="h-11 w-full">
          <Link href="/mypage">マイページへ</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state && !state.ok && !fieldErrors && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Field id="password" label="新しいパスワード" required errors={fieldErrors?.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          className="h-11"
          required
        />
      </Field>

      <Field
        id="passwordConfirm"
        label="新しいパスワード(確認)"
        required
        errors={fieldErrors?.passwordConfirm}
      >
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          className="h-11"
          required
        />
      </Field>

      <SubmitButton className="h-11 w-full" pendingLabel="変更中...">
        パスワードを変更する
      </SubmitButton>
    </form>
  );
}
