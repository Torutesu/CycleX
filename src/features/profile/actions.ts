"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUserAction } from "@/lib/session";
import { ok, fail, toUserMessage, type ActionResult } from "@/lib/errors";
import { profileSchema } from "@/features/profile/schema";
import { IMAGE_BUCKETS, isOwnedImagePath } from "@/lib/images";
import { removeStorageObjects } from "@/lib/storage";

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** FR-02: プロフィールの更新 */
export async function updateProfile(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  let userId: string;
  try {
    const user = await requireUserAction();
    userId = user.id;
  } catch (error) {
    return fail(toUserMessage(error));
  }

  const parsed = profileSchema.safeParse({
    displayName: formValue(formData, "displayName"),
    bio: formValue(formData, "bio"),
    prefecture: formValue(formData, "prefecture"),
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return fail("入力内容を確認してください", flat.fieldErrors as Record<string, string[]>);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({
      display_name: parsed.data.displayName,
      bio: parsed.data.bio,
      prefecture: parsed.data.prefecture,
    })
    .eq("id", userId);

  if (error) {
    return fail("プロフィールの更新に失敗しました。時間をおいて再度お試しください。");
  }

  revalidatePath("/mypage/profile");
  revalidatePath("/mypage");
  revalidatePath(`/users/${userId}`);
  revalidatePath("/", "layout");
  return ok();
}

/**
 * アイコン画像のパスを保存する。
 * ファイル本体は Client Component から Storage へ直接アップロードし、
 * ここでは保存済みパスの反映のみを行う。
 */
export async function updateAvatar(path: string | null): Promise<ActionResult<undefined>> {
  let userId: string;
  try {
    const user = await requireUserAction();
    userId = user.id;
  } catch (error) {
    return fail(toUserMessage(error));
  }

  // 自分のフォルダ配下のパスであることを確認する(他人のファイルを指せないように)
  if (path !== null && !isOwnedImagePath(path, userId)) {
    return fail("不正な画像パスです");
  }

  const supabase = await createClient();

  // 差し替え前のパスを控えておき、更新後に実体を消す
  const { data: before } = await supabase
    .from("users")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await supabase.from("users").update({ avatar_url: path }).eq("id", userId);

  if (error) {
    return fail("アイコンの更新に失敗しました。時間をおいて再度お試しください。");
  }

  // 外部 URL(Google ログインのアイコン)は Storage に無いので対象外
  const previous = before?.avatar_url;
  if (previous && previous !== path && isOwnedImagePath(previous, userId)) {
    await removeStorageObjects(IMAGE_BUCKETS.avatar, [previous]);
  }

  revalidatePath("/mypage/profile");
  revalidatePath("/", "layout");
  return ok();
}

/** 通知設定(FR-13)の更新 */
export async function updateNotificationPrefs(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  let userId: string;
  try {
    const user = await requireUserAction();
    userId = user.id;
  } catch (error) {
    return fail(toUserMessage(error));
  }

  // チェックが外れているカテゴリのみ false を保存する(デフォルトは ON)
  const categories = ["transaction", "message", "review"] as const;
  const prefs: Record<string, boolean> = {};
  for (const category of categories) {
    prefs[category] = formData.get(category) === "on";
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ notification_prefs: prefs })
    .eq("id", userId);

  if (error) {
    return fail("通知設定の更新に失敗しました。時間をおいて再度お試しください。");
  }

  revalidatePath("/mypage/settings");
  return ok();
}
