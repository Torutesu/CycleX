"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { changeEmail, updatePassword, withdraw } from "@/features/auth/actions";
import { updateNotificationPrefs } from "@/features/profile/actions";
import type { ActionResult } from "@/lib/errors";

// ------------------------------------------------------------
// メールアドレス変更
// ------------------------------------------------------------

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction] = useActionState<ActionResult<undefined> | null, FormData>(
    changeEmail,
    null,
  );

  useEffect(() => {
    if (state?.ok) toast.success("新しいメールアドレス宛に確認メールを送信しました");
  }, [state]);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state && !state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Field
        id="new-email"
        label="新しいメールアドレス"
        required
        hint={`現在のアドレス: ${currentEmail}。変更には新しいアドレスでの確認が必要です。`}
      >
        <Input
          id="new-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          className="h-11"
          required
        />
      </Field>

      <SubmitButton variant="outline" className="h-11" pendingLabel="送信中...">
        確認メールを送信
      </SubmitButton>
    </form>
  );
}

// ------------------------------------------------------------
// パスワード変更
// ------------------------------------------------------------

export function ChangePasswordForm() {
  const [state, formAction] = useActionState<ActionResult<undefined> | null, FormData>(
    updatePassword,
    null,
  );
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    if (state?.ok) toast.success("パスワードを変更しました");
  }, [state]);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state && !state.ok && !fieldErrors && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Field
        id="settings-password"
        label="新しいパスワード"
        required
        hint="8文字以上、英字と数字をそれぞれ1文字以上"
        errors={fieldErrors?.password}
      >
        <Input
          id="settings-password"
          name="password"
          type="password"
          autoComplete="new-password"
          className="h-11"
          required
        />
      </Field>

      <Field
        id="settings-password-confirm"
        label="新しいパスワード(確認)"
        required
        errors={fieldErrors?.passwordConfirm}
      >
        <Input
          id="settings-password-confirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          className="h-11"
          required
        />
      </Field>

      <SubmitButton variant="outline" className="h-11" pendingLabel="変更中...">
        パスワードを変更
      </SubmitButton>
    </form>
  );
}

// ------------------------------------------------------------
// 通知設定(FR-13)
// ------------------------------------------------------------

const NOTIFICATION_CATEGORIES = [
  {
    name: "transaction",
    label: "取引に関するお知らせ",
    description: "購入・発送・受取確認・取引完了・キャンセル",
  },
  { name: "message", label: "新着メッセージ", description: "出品者・購入者からのメッセージ受信時" },
  { name: "review", label: "評価に関するお知らせ", description: "評価の依頼・受け取り" },
] as const;

export function NotificationPrefsForm({ prefs }: { prefs: Record<string, boolean> }) {
  const [state, formAction] = useActionState<ActionResult<undefined> | null, FormData>(
    updateNotificationPrefs,
    null,
  );

  useEffect(() => {
    if (state?.ok) toast.success("通知設定を更新しました");
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      {state && !state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <ul className="space-y-3">
        {NOTIFICATION_CATEGORIES.map((category) => (
          <li key={category.name} className="flex items-start gap-3">
            <Checkbox
              id={`notify-${category.name}`}
              name={category.name}
              defaultChecked={prefs[category.name] !== false}
              className="mt-0.5"
            />
            <label htmlFor={`notify-${category.name}`} className="cursor-pointer text-sm">
              <span className="font-medium">{category.label}</span>
              <span className="block text-xs text-muted-foreground">{category.description}</span>
            </label>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        会員登録・パスワード再設定など、アカウントに関するメールは停止できません。
      </p>

      <SubmitButton variant="outline" className="h-11" pendingLabel="保存中...">
        通知設定を保存
      </SubmitButton>
    </form>
  );
}

// ------------------------------------------------------------
// 退会(FR-01-5)
// ------------------------------------------------------------

export function WithdrawDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionResult<undefined> | null, FormData>(
    withdraw,
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="h-11">
          退会する
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>退会の確認</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>退会すると、以下の内容が適用されます。取り消しはできません。</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>プロフィール(表示名・アイコン・自己紹介)が削除されます</li>
                <li>公開中の商品はすべて取下げられます</li>
                <li>過去の取引履歴と評価は記録として残ります</li>
                <li>進行中の取引がある場合は退会できません</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {state && !state.ok && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-start gap-3">
            <Checkbox id="withdraw-confirm" name="confirm" value="yes" className="mt-0.5" />
            <label htmlFor="withdraw-confirm" className="cursor-pointer text-sm">
              上記の内容を確認し、退会に同意します
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <SubmitButton variant="destructive" className="h-11" pendingLabel="処理中...">
              退会する
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
