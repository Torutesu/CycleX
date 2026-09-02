import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthFormShell } from "@/features/auth/components/auth-form-shell";
import { GoogleButton } from "@/features/auth/components/google-button";
import { isGoogleLoginEnabled } from "@/features/auth/providers";
import { LoginForm } from "@/features/auth/components/login-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getCurrentUser } from "@/lib/session";
import { safeRedirectPath } from "@/lib/utils";

export const metadata: Metadata = { title: "ログイン" };

/**
 * `/auth/callback` から戻されたときの案内。
 * 黙ってログイン画面に落とすと、確認メールのリンクが切れたのか
 * こちらの不具合なのか利用者に分からないため、必ず理由を出す。
 */
const ERROR_MESSAGES: Record<string, string> = {
  google: "Googleログインに失敗しました。時間をおいて再度お試しください。",
  expired:
    "リンクの有効期限が切れています。お手数ですが、もう一度メールの送信からやり直してください。",
  callback:
    "リンクを確認できませんでした。有効期限が切れているか、すでに使用済みの可能性があります。もう一度お試しください。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next ?? null, "/");

  const user = await getCurrentUser();
  if (user) redirect(next);

  const message = ERROR_MESSAGES[params.error ?? ""];
  const googleEnabled = await isGoogleLoginEnabled();

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
        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {googleEnabled && (
          <>
            <GoogleButton next={next} />
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">または</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        <LoginForm next={next} />
      </div>
    </AuthFormShell>
  );
}
