import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ChangeEmailForm,
  ChangePasswordForm,
  NotificationPrefsForm,
  WithdrawDialog,
} from "@/features/profile/components/settings-forms";

export const metadata: Metadata = { title: "設定" };

export default async function SettingsPage() {
  const user = await requireUser("/mypage/settings");

  // notification_prefs は anon には見せていない列のため service role で読む
  // (対象は requireUser() で確認済みの本人 ID のみ)。
  const { data } = await createAdminClient()
    .from("users")
    .select("notification_prefs")
    .eq("id", user.id)
    .single();

  const prefs = (data?.notification_prefs ?? {}) as Record<string, boolean>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href="/mypage"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        マイページ
      </Link>

      <h1 className="text-xl font-bold">設定</h1>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">メールアドレス</h2>
        <ChangeEmailForm currentEmail={user.email} />
      </section>

      <Separator className="my-8" />

      <section>
        <h2 className="mb-3 text-sm font-semibold">パスワード</h2>
        <ChangePasswordForm />
      </section>

      <Separator className="my-8" />

      <section>
        <h2 className="mb-3 text-sm font-semibold">メール通知</h2>
        <NotificationPrefsForm prefs={prefs} />
      </section>

      <Separator className="my-8" />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-destructive">退会</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          アカウントを削除します。進行中の取引がある場合は退会できません。
        </p>
        <WithdrawDialog />
      </section>
    </div>
  );
}
