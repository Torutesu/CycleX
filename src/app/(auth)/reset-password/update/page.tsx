import type { Metadata } from "next";
import { AuthFormShell } from "@/features/auth/components/auth-form-shell";
import { ResetUpdateForm } from "@/features/auth/components/reset-update-form";

export const metadata: Metadata = { title: "新しいパスワードの設定" };

export default function ResetPasswordUpdatePage() {
  return (
    <AuthFormShell
      title="新しいパスワードを設定"
      description="8文字以上、英字と数字をそれぞれ1文字以上含めてください。"
    >
      <ResetUpdateForm />
    </AuthFormShell>
  );
}
