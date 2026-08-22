"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/form/submit-button";
import { resendVerificationEmail } from "@/features/auth/actions";
import type { ActionResult } from "@/lib/errors";

export function ResendVerificationForm({ email }: { email: string }) {
  const [state, formAction] = useActionState<ActionResult<undefined> | null, FormData>(
    resendVerificationEmail,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="email" value={email} />

      {state?.ok && (
        <Alert>
          <AlertDescription>確認メールを再送しました。</AlertDescription>
        </Alert>
      )}
      {state && !state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <SubmitButton variant="outline" className="h-11 w-full" pendingLabel="送信中...">
        確認メールを再送する
      </SubmitButton>
    </form>
  );
}
