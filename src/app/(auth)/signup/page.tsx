import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthFormShell } from "@/features/auth/components/auth-form-shell";
import { GoogleButton } from "@/features/auth/components/google-button";
import { isGoogleLoginEnabled } from "@/features/auth/providers";
import { SignupForm } from "@/features/auth/components/signup-form";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "会員登録" };

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/mypage");

  const googleEnabled = await isGoogleLoginEnabled();

  return (
    <AuthFormShell
      title="会員登録"
      description="自転車・パーツの出品と購入にはアカウントが必要です。"
      footer={
        <p className="text-muted-foreground">
          すでにアカウントをお持ちの方は{" "}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            ログイン
          </Link>
        </p>
      }
    >
      <div className="space-y-5">
        {googleEnabled && (
          <>
            <GoogleButton />
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">または</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        <SignupForm />
      </div>
    </AuthFormShell>
  );
}
