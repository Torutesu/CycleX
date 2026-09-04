"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field } from "@/components/form/field";
import { PasswordInput } from "@/components/form/password-input";
import { SubmitButton } from "@/components/form/submit-button";
import { signup } from "@/features/auth/actions";
import { DISPLAY_NAME_MAX } from "@/lib/constants";
import type { ActionResult } from "@/lib/errors";

export function SignupForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<ActionResult<undefined> | null, FormData>(
    signup,
    null,
  );
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}

      {state && !state.ok && !fieldErrors && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Field id="displayName" label="表示名" required errors={fieldErrors?.displayName}>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX}
          className="h-11"
          required
        />
      </Field>

      <Field id="email" label="メールアドレス" required errors={fieldErrors?.email}>
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

      <Field
        id="password"
        label="パスワード"
        required
        hint="8文字以上、英字と数字をそれぞれ1文字以上含めてください"
        errors={fieldErrors?.password}
      >
        <PasswordInput id="password" name="password" autoComplete="new-password" required />
      </Field>

      <SubmitButton className="h-11 w-full" pendingLabel="登録中...">
        会員登録する
      </SubmitButton>
    </form>
  );
}
