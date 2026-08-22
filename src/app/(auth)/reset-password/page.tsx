import Link from "next/link";
import type { Metadata } from "next";
import { AuthFormShell } from "@/features/auth/components/auth-form-shell";
import { ResetRequestForm } from "@/features/auth/components/reset-request-form";

export const metadata: Metadata = { title: "パスワードの再設定" };

export default function ResetPasswordPage() {
  return (
    <AuthFormShell
      title="パスワードの再設定"
      description="ご登録のメールアドレス宛に、再設定用のリンクをお送りします。"
      footer={
        <Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">
          ログイン画面へ戻る
        </Link>
      }
    >
      <ResetRequestForm />
    </AuthFormShell>
  );
}
