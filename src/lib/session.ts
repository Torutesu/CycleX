import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  prefecture: string | null;
  role: "user" | "admin";
  status: "active" | "suspended" | "withdrawn";
  emailVerified: boolean;
};

/**
 * ログイン中ユーザーのプロフィールを返す。未ログインなら null。
 * Server Component / Server Action から使用する。
 *
 * 同一リクエスト内で何度も呼ばれる(レイアウト + 各ページ)ため `cache()` で包む。
 * これがないと 1 ページの描画ごとに Supabase へ往復が積み上がる。
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // email / role / email_verified_at は anon・authenticated には列単位で
  // 見せていない(20260101000004_harden_grants.sql)。
  // 本人であることは getUser() で検証済みなので、その id に限って service role で引く。
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id, email, display_name, avatar_url, prefecture, role, status, email_verified_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    prefecture: profile.prefecture,
    role: profile.role as SessionUser["role"],
    status: profile.status as SessionUser["status"],
    // Supabase Auth 側の確認完了が users へ同期される
    emailVerified: Boolean(profile.email_verified_at ?? user.email_confirmed_at),
  };
});

/** ログイン必須のページで使用する。未ログインならログイン画面へ送る。 */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const params = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/login${params}`);
  }
  if (user.status === "suspended") {
    redirect("/suspended");
  }
  return user;
}

/** 管理画面で使用する。権限がなければ 404 として扱い、存在自体を隠す。 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || user.status !== "active") {
    notFound();
  }
  return user;
}

/**
 * Server Action 内でログイン+メール確認済みを要求する。
 * 出品・購入・メッセージなど「確認完了まで不可」の操作で使う(FR-01-1)。
 */
export async function requireVerifiedUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("ログインが必要です。");
  if (user.status === "suspended")
    throw new AppError("アカウントが利用停止中のため、この操作は行えません。");
  if (user.status === "withdrawn") throw new AppError("退会済みのアカウントです。");
  if (!user.emailVerified) {
    throw new AppError(
      "メールアドレスの確認が完了していません。確認メールのリンクから認証してください。",
    );
  }
  return user;
}

/** Server Action 内でログインのみを要求する(メール確認は問わない) */
export async function requireUserAction(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("ログインが必要です。");
  if (user.status === "suspended")
    throw new AppError("アカウントが利用停止中のため、この操作は行えません。");
  return user;
}
