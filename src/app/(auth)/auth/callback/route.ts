import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyWelcome } from "@/features/notification/notify";
import { decideAuthCallback } from "@/features/auth/callback-rules";

/**
 * メール確認リンク・OAuth・パスワードリセットの共通コールバック。
 *
 * `?code=`(PKCE)と `?token_hash=`(メールテンプレートの TokenHash 形式)の
 * どちらでもセッションを張れるようにしている。判定は callback-rules.ts。
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const decision = decideAuthCallback(searchParams);

  if (decision.kind === "error") {
    return NextResponse.redirect(`${origin}/login?error=${decision.reason}`);
  }

  const supabase = await createClient();
  const { data, error } =
    decision.kind === "code"
      ? await supabase.auth.exchangeCodeForSession(decision.code)
      : await supabase.auth.verifyOtp({ type: decision.type, token_hash: decision.tokenHash });

  if (error) {
    console.error("[auth callback] セッションを作れませんでした", decision.kind, error.message);
    return NextResponse.redirect(`${origin}/login?error=callback`);
  }

  // 初回のログイン(=登録完了)にウェルカムメールを送る。
  // 送信済みかは email_logs で判定し、二重送信を避ける。
  if (data.user) {
    await sendWelcomeOnce(data.user.id);
  }

  return NextResponse.redirect(`${origin}${decision.next}`);
}

async function sendWelcomeOnce(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("email_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", "welcome");

    if ((count ?? 0) > 0) return;
    await notifyWelcome(userId);
  } catch (error) {
    // 通知の失敗でログインを妨げない
    console.error("[welcome mail failed]", error);
  }
}
