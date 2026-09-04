"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, requireUserAction } from "@/lib/session";
import { ok, fail, type ActionResult, toUserMessage, AppError } from "@/lib/errors";
import { absoluteUrl, safeRedirectPath } from "@/lib/utils";
import { ACTIVE_TRANSACTION_STATUSES } from "@/lib/constants";
import { IMAGE_BUCKETS } from "@/lib/images";
import { removeUserFolder } from "@/lib/storage";
import { canWithdraw, resolvePostLoginPath } from "@/features/auth/rules";
import {
  signupSchema,
  loginSchema,
  resetRequestSchema,
  resetUpdateSchema,
  changeEmailSchema,
} from "@/features/auth/schema";

/** ログイン失敗時は原因を特定させない共通メッセージを返す(アカウント列挙対策) */
const LOGIN_FAILED_MESSAGE = "メールアドレスまたはパスワードが正しくありません";

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// ============================================================
// FR-01-1 サインアップ
// ============================================================

export async function signup(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  const parsed = signupSchema.safeParse({
    email: formValue(formData, "email"),
    password: formValue(formData, "password"),
    displayName: formValue(formData, "displayName"),
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return fail("入力内容を確認してください", flat.fieldErrors as Record<string, string[]>);
  }

  // 確認リンクを踏んだ後は、登録を始める前に見ていた画面へ戻す(FR-01-6)
  const next = safeRedirectPath(formValue(formData, "next") || null, "/mypage");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: absoluteUrl(`/auth/callback?next=${encodeURIComponent(next)}`),
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return fail("このメールアドレスはすでに登録されています");
    }
    return fail("会員登録に失敗しました。時間をおいて再度お試しください。");
  }

  // メール確認必須の設定では、登録済みのアドレスに対して Supabase が
  // identities の無い偽のユーザーを返す(確認メールは送られない)。
  // 黙って「送信しました」に着地させず、ログインか再設定へ案内する
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return fail(
      "このメールアドレスはすでに登録されています。ログインするか、パスワードをお忘れの場合は再設定してください。",
    );
  }

  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
}

/** 確認メールの再送を同じ宛先に対して抑制する時間(分) */
const RESEND_COOLDOWN_MINUTES = 5;

/**
 * 確認メールの再送。
 *
 * 任意のアドレスに無制限に送れると、Supabase の時間当たり送信上限を
 * 使い切られて正規の登録・再設定メールまで止まる。宛先が会員として存在し、
 * 未確認で、直近に送っていないときだけ送る。存在有無は結果に出さない。
 */
export async function resendVerificationEmail(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  const email = formValue(formData, "email").trim().toLowerCase();
  if (!email) return fail("メールアドレスが指定されていません");

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("users")
    .select("id, email_verified_at")
    .eq("email", email)
    .maybeSingle();

  // 未登録・確認済みは送らない(結果は同じ表示にする)
  if (!target || target.email_verified_at) return ok();

  const since = new Date(Date.now() - RESEND_COOLDOWN_MINUTES * 60 * 1000).toISOString();
  const { count } = await admin
    .from("email_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", target.id)
    .eq("kind", "verification_resend")
    .gte("created_at", since);
  if ((count ?? 0) > 0) return ok();

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: absoluteUrl("/auth/callback?next=/mypage") },
  });

  await admin.from("email_logs").insert({
    user_id: target.id,
    kind: "verification_resend",
    status: error ? "failed" : "sent",
    error: error?.message ?? null,
  });

  if (error) return fail("再送に失敗しました。時間をおいて再度お試しください。");
  return ok();
}

// ============================================================
// FR-01-3 ログイン / ログアウト
// ============================================================

export async function login(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  const parsed = loginSchema.safeParse({
    email: formValue(formData, "email"),
    password: formValue(formData, "password"),
  });

  if (!parsed.success) {
    return fail(LOGIN_FAILED_MESSAGE);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  // パスワードは合っているがメール未確認。原因が分からないまま
  // 無意味なパスワード再設定に進ませないよう、確認画面へ案内する
  // (パスワードが合っている時点で存在は本人に分かっているので列挙対策は損なわない)
  if (error?.code === "email_not_confirmed") {
    redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
  }

  if (error || !data.user) {
    return fail(LOGIN_FAILED_MESSAGE);
  }

  // 退会済み・利用停止のアカウントはログインさせない
  const { data: profile } = await supabase
    .from("users")
    .select("status")
    .eq("id", data.user.id)
    .maybeSingle();

  const next = safeRedirectPath(formValue(formData, "next") || null, "/");
  const outcome = resolvePostLoginPath(
    profile?.status as "active" | "suspended" | "withdrawn" | undefined,
    next,
  );

  if (outcome.signOut) {
    await supabase.auth.signOut();
    return fail(outcome.error ?? LOGIN_FAILED_MESSAGE);
  }

  revalidatePath("/", "layout");
  redirect(outcome.path);
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

// ============================================================
// FR-01-2 Google ログイン
// ============================================================

export async function loginWithGoogle(formData: FormData): Promise<void> {
  const next = safeRedirectPath(formValue(formData, "next") || null, "/");
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: absoluteUrl(`/auth/callback?next=${encodeURIComponent(next)}`),
    },
  });

  if (error || !data.url) {
    redirect("/login?error=google");
  }

  redirect(data.url);
}

// ============================================================
// FR-01-4 パスワードリセット
// ============================================================

export async function requestPasswordReset(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  const parsed = resetRequestSchema.safeParse({ email: formValue(formData, "email") });

  // 未登録アドレスでも同じ応答を返し、アカウントの存在有無を漏らさない
  if (!parsed.success) {
    return fail("メールアドレスの形式が正しくありません");
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: absoluteUrl("/auth/callback?next=/reset-password/update"),
  });

  return ok();
}

export async function updatePassword(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  const parsed = resetUpdateSchema.safeParse({
    password: formValue(formData, "password"),
    passwordConfirm: formValue(formData, "passwordConfirm"),
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return fail("入力内容を確認してください", flat.fieldErrors as Record<string, string[]>);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail("リンクの有効期限が切れています。もう一度パスワードリセットをやり直してください。");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return fail("パスワードの変更に失敗しました。時間をおいて再度お試しください。");
  }

  return ok();
}

// ============================================================
// 設定: メールアドレス変更
// ============================================================

export async function changeEmail(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    await requireUserAction();
  } catch (error) {
    return fail(toUserMessage(error));
  }

  const parsed = changeEmailSchema.safeParse({ email: formValue(formData, "email") });
  if (!parsed.success) {
    return fail("メールアドレスの形式が正しくありません");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    { emailRedirectTo: absoluteUrl("/auth/callback?next=/mypage/settings") },
  );

  if (error) {
    return fail("メールアドレスの変更に失敗しました。別のアドレスをお試しください。");
  }

  return ok();
}

// ============================================================
// FR-01-5 退会
// ============================================================

export async function withdraw(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  const confirmed = formValue(formData, "confirm") === "yes";
  if (!confirmed) return fail("退会の確認にチェックしてください");

  const user = await getCurrentUser();
  if (!user) return fail("ログインが必要です。");
  if (user.status !== "active") {
    return fail("現在のアカウント状態では退会手続きを行えません。運営までお問い合わせください。");
  }

  const admin = createAdminClient();

  try {
    // 1. 進行中の取引を確認
    const { count } = await admin
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .in("status", [...ACTIVE_TRANSACTION_STATUSES]);

    if (!canWithdraw(count ?? 0)) {
      throw new AppError(
        "進行中の取引があるため退会できません。取引の完了後に再度お試しください。",
      );
    }

    // 2. プロフィールを匿名化して退会状態にする(取引履歴・評価はデータとして保持)
    const { error: profileError } = await admin
      .from("users")
      .update({
        status: "withdrawn",
        display_name: "退会済みユーザー",
        avatar_url: null,
        bio: null,
        prefecture: null,
        withdrawn_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileError)
      throw new AppError("退会処理に失敗しました。時間をおいて再度お試しください。");

    // 3. 公開中・下書きの出品を取下げる
    await admin
      .from("listings")
      .update({ status: "withdrawn" })
      .eq("seller_id", user.id)
      .in("status", ["published", "draft"]);

    // 4. アイコン画像の実体を削除する。
    //    avatar_url を null にするだけでは、公開 URL を知っていれば退会後も閲覧できてしまう。
    await removeUserFolder(IMAGE_BUCKETS.avatar, user.id);

    // 5. 以降ログインできないようにする
    const { error: banError } = await admin.auth.admin.updateUserById(user.id, {
      ban_duration: "876000h",
      app_metadata: { status: "withdrawn" },
    });
    if (banError) throw new AppError("退会処理に失敗しました。時間をおいて再度お試しください。");

    // 6. メールアドレスと Google の identity を解放し、同じメールで再登録できるようにする
    const { error: releaseError } = await admin.rpc("release_withdrawn_account", {
      target: user.id,
    });
    if (releaseError) {
      console.error("[withdraw] release_withdrawn_account failed", releaseError);
      throw new AppError("退会処理に失敗しました。時間をおいて再度お試しください。");
    }
  } catch (error) {
    return fail(toUserMessage(error));
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/?withdrawn=1");
}
