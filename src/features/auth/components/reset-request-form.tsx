"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { requestPasswordReset } from "@/features/auth/actions";
import type { ActionResult } from "@/lib/errors";

export function ResetRequestForm() {
  const [state, formAction] = useActionState<ActionResult<undefined> | null, FormData>(
    requestPasswordReset,
    null,
  );

  // 送信済みはアカウントの存在有無に関わらず同じ表示にする
  if (state?.ok) {
    return (
      <Alert>
        <AlertDescription>
          メールを送信しました。受信箱をご確認のうえ、リンクからパスワードを再設定してください。
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
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

      <SubmitButton className="h-11 w-full" pendingLabel="送信中...">
        再設定リンクを送信
      </SubmitButton>
    </form>
  );
}
