import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/actions";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "アカウント利用停止のお知らせ" };

/**
 * 管理者により非表示化(利用停止)されたユーザーの案内ページ(FR-11)。
 * proxy.ts がこのパス以外へのアクセスをここへリダイレクトする。
 */
export default async function SuspendedPage() {
  const user = await getCurrentUser();
  const withdrawn = user?.status === "withdrawn";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-16 text-center">
      <ShieldAlert className="size-12 text-destructive" aria-hidden />
      <h1 className="mt-4 text-xl font-bold">
        {withdrawn ? "このアカウントは退会済みです" : "アカウントの利用を停止しています"}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {withdrawn
          ? "退会手続きが完了しています。引き続きご利用になる場合は、ログアウトのうえ新規に会員登録してください。"
          : "ご利用のアカウントは、運営による確認のため一時的に利用を停止しています。お心当たりのない場合は、運営までお問い合わせください。"}
      </p>
      <form action={logout} className="mt-8 w-full">
        <Button type="submit" variant="outline" className="h-11 w-full">
          ログアウト
        </Button>
      </form>
    </div>
  );
}
