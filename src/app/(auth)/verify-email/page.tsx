import Link from "next/link";
import type { Metadata } from "next";
import { MailCheck } from "lucide-react";
import { AuthFormShell } from "@/features/auth/components/auth-form-shell";
import { ResendVerificationForm } from "@/features/auth/components/resend-verification-form";

export const metadata: Metadata = { title: "メールアドレスの確認" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AuthFormShell
      title="確認メールを送信しました"
      footer={
        <Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">
          ログイン画面へ戻る
        </Link>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg bg-accent/60 p-4">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">{email ?? "ご登録のメールアドレス"} 宛に送信しました</p>
            <p className="mt-1 text-muted-foreground">
              メール内のリンクを開くと登録が完了します。リンクの有効期限は1時間です。
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          メールが届かない場合は、迷惑メールフォルダをご確認ください。
        </p>

        {email && <ResendVerificationForm email={email} />}
      </div>
    </AuthFormShell>
  );
}
