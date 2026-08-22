import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthFormShell } from "@/features/auth/components/auth-form-shell";
import { GoogleButton } from "@/features/auth/components/google-button";
import { LoginForm } from "@/features/auth/components/login-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getCurrentUser } from "@/lib/session";
import { safeRedirectPath } from "@/lib/utils";

export const metadata: Metadata = { title: "ログイン" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next ?? null, "/");

  const user = await getCurrentUser();
  if (user) redirect(next);

  return (
    <AuthFormShell
      title="ログイン"
      footer={
        <p className="text-muted-foreground">
          アカウントをお持ちでない方は{" "}
          <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
            会員登録
          </Link>
        </p>
      }
    >
      <div className="space-y-5">
        {params.error === "google" && (
          <Alert variant="destructive">
            <AlertDescription>
              Googleログインに失敗しました。時間をおいて再度お試しください。
            </AlertDescription>
          </Alert>
        )}

        <GoogleButton next={next} />
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">または</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <LoginForm next={next} />
      </div>
    </AuthFormShell>
  );
}
