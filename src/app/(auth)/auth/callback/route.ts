import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyWelcome } from "@/features/notification/notify";
import { safeRedirectPath } from "@/lib/utils";

/**
 * メール確認リンク・OAuth・パスワードリセットの共通コールバック。
 * 認可コードをセッションへ交換したうえで next へ送る。
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), "/mypage");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=callback`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=callback`);
  }

  // 初回のログイン(=登録完了)にウェルカムメールを送る。
  // 送信済みかは email_logs で判定し、二重送信を避ける。
  if (data.user) {
    await sendWelcomeOnce(data.user.id);
  }

  return NextResponse.redirect(`${origin}${next}`);
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
