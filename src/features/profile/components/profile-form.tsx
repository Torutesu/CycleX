"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { updateProfile } from "@/features/profile/actions";
import { BIO_MAX, DISPLAY_NAME_MAX, PREFECTURES } from "@/lib/constants";
import type { ActionResult } from "@/lib/errors";

type ProfileFormProps = {
  defaultValues: {
    displayName: string;
    bio: string;
    prefecture: string;
  };
};

const NO_PREFECTURE = "__none__";

export function ProfileForm({ defaultValues }: ProfileFormProps) {
  const [state, formAction] = useActionState<ActionResult<undefined> | null, FormData>(
    updateProfile,
    null,
  );
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    if (state?.ok) toast.success("プロフィールを更新しました");
  }, [state]);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state && !state.ok && !fieldErrors && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Field id="displayName" label="表示名" required errors={fieldErrors?.displayName}>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={defaultValues.displayName}
          maxLength={DISPLAY_NAME_MAX}
          className="h-11"
          required
        />
      </Field>

      <Field
        id="bio"
        label="自己紹介"
        hint={`${BIO_MAX}文字以内。乗っている車種や取引の希望などを書けます。`}
        errors={fieldErrors?.bio}
      >
        <Textarea
          id="bio"
          name="bio"
          defaultValue={defaultValues.bio}
          maxLength={BIO_MAX}
          rows={5}
        />
      </Field>

      <Field
        id="prefecture"
        label="所在地(都道府県)"
        hint="対面での受渡や、地域での絞り込みに使われます。"
        errors={fieldErrors?.prefecture}
      >
        <Select name="prefecture" defaultValue={defaultValues.prefecture || NO_PREFECTURE}>
          <SelectTrigger id="prefecture" className="h-11 w-full">
            <SelectValue placeholder="選択してください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PREFECTURE}>選択しない</SelectItem>
            {PREFECTURES.map((pref) => (
              <SelectItem key={pref.value} value={pref.value}>
                {pref.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <SubmitButton className="h-11 w-full sm:w-auto" pendingLabel="保存中...">
        変更を保存
      </SubmitButton>
    </form>
  );
}
