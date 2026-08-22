"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminAction } from "@/features/admin/guard";
import { ok, fail, toUserMessage, AppError, type ActionResult } from "@/lib/errors";
import type { ListingStatus, UserStatus } from "@/lib/constants";
import {
  canSuspendListing,
  canSuspendUser,
  SUSPENDABLE_LISTING_STATUSES,
} from "@/features/admin/rules";
import { getTransaction, transitionTransaction } from "@/features/transaction/service";
import { notifyCanceled } from "@/features/notification/notify";

const reasonSchema = z
  .string()
  .trim()
  .max(500, "理由は500文字以内で入力してください")
  .optional()
  .transform((value) => (value ? value : null));

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// ============================================================
// 利用者管理(AD-02)
// ============================================================

/** FR-11: 利用者の非表示化(利用停止)。公開中の出品も連動して非表示にする。 */
export async function suspendUser(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const admin = await requireAdminAction();
    const userId = formValue(formData, "userId");
    const parsed = reasonSchema.safeParse(formValue(formData, "reason"));
    if (!parsed.success) return fail("入力内容を確認してください");

    const supabase = createAdminClient();
    const { data: target } = await supabase
      .from("users")
      .select("id, role, status")
      .eq("id", userId)
      .maybeSingle();

    if (!target) throw new AppError("利用者が見つかりません。");

    const check = canSuspendUser(
      target.id,
      admin.id,
      target.role,
      target.status as UserStatus,
    );
    if (!check.allowed) throw new AppError(check.reason);

    const { error } = await supabase
      .from("users")
      .update({ status: "suspended", suspended_reason: parsed.data })
      .eq("id", userId);

    if (error) throw new AppError("利用停止に失敗しました。");

    // 公開中・取下げ中の出品をまとめて非表示にする
    await supabase
      .from("listings")
      .update({
        status: "suspended",
        suspended_reason: "利用者の利用停止に伴う非表示",
      })
      .eq("seller_id", userId)
      .in("status", [...SUSPENDABLE_LISTING_STATUSES]);

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/search");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/** 利用停止の解除。出品は自動復帰させず、個別に解除する。 */
export async function unsuspendUser(userId: string): Promise<ActionResult<undefined>> {
  try {
    await requireAdminAction();
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("users")
      .update({ status: "active", suspended_reason: null })
      .eq("id", userId)
      .eq("status", "suspended");

    if (error) throw new AppError("利用停止の解除に失敗しました。");

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

// ============================================================
// 出品管理(AD-03)
// ============================================================

/** FR-11: 商品の非表示化 */
export async function suspendListing(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    await requireAdminAction();
    const listingId = formValue(formData, "listingId");
    const parsed = reasonSchema.safeParse(formValue(formData, "reason"));
    if (!parsed.success) return fail("入力内容を確認してください");

    const supabase = createAdminClient();
    const { data: listing } = await supabase
      .from("listings")
      .select("id, status")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) throw new AppError("商品が見つかりません。");

    const check = canSuspendListing(listing.status as ListingStatus);
    if (!check.allowed) throw new AppError(check.reason);

    const { error } = await supabase
      .from("listings")
      .update({ status: "suspended", suspended_reason: parsed.data })
      .eq("id", listingId);

    if (error) throw new AppError("非表示化に失敗しました。");

    revalidatePath("/admin/listings");
    revalidatePath(`/items/${listingId}`);
    revalidatePath("/search");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/** 非表示の解除(公開中へ戻す) */
export async function unsuspendListing(listingId: string): Promise<ActionResult<undefined>> {
  try {
    await requireAdminAction();
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("listings")
      .update({ status: "published", suspended_reason: null })
      .eq("id", listingId)
      .eq("status", "suspended");

    if (error) throw new AppError("非表示の解除に失敗しました。");

    revalidatePath("/admin/listings");
    revalidatePath(`/items/${listingId}`);
    revalidatePath("/search");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

// ============================================================
// 取引管理(AD-04)
// ============================================================

/**
 * FR-08: 管理者による取引キャンセル。
 * 返金は行わない(運営が Stripe ダッシュボードで実施する)。
 */
export async function cancelTransaction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const admin = await requireAdminAction();
    const transactionId = formValue(formData, "transactionId");
    const parsed = reasonSchema.safeParse(formValue(formData, "reason"));
    if (!parsed.success) return fail("入力内容を確認してください");
    if (!parsed.data) throw new AppError("キャンセル理由を入力してください。");

    const transaction = await getTransaction(transactionId);
    if (!transaction) throw new AppError("取引が見つかりません。");

    await transitionTransaction(transaction, "canceled", "admin", {
      patch: { canceled_reason: parsed.data },
      actorId: admin.id,
      note: parsed.data,
    });

    await notifyCanceled(transactionId, parsed.data);

    revalidatePath("/admin/transactions");
    revalidatePath(`/transactions/${transactionId}`);
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

// ============================================================
// 通報管理(AD-05)
// ============================================================

export async function resolveReport(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const admin = await requireAdminAction();
    const reportId = formValue(formData, "reportId");
    const parsed = reasonSchema.safeParse(formValue(formData, "note"));
    if (!parsed.success) return fail("入力内容を確認してください");

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("reports")
      .update({
        status: "resolved",
        resolved_by: admin.id,
        resolved_note: parsed.data,
      })
      .eq("id", reportId);

    if (error) throw new AppError("対応状況の更新に失敗しました。");

    revalidatePath("/admin/reports");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

// ============================================================
// ブランド管理(AD-06)
// ============================================================

const brandNameSchema = z
  .string()
  .trim()
  .min(1, "ブランド名を入力してください")
  .max(80, "ブランド名は80文字以内で入力してください");

export async function createBrand(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    await requireAdminAction();
    const parsed = brandNameSchema.safeParse(formValue(formData, "name"));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("brands").insert({ name: parsed.data });

    if (error) {
      throw new AppError(
        error.code === "23505"
          ? "同名のブランドがすでに登録されています。"
          : "ブランドの追加に失敗しました。",
      );
    }

    revalidatePath("/admin/brands");
    revalidatePath("/sell");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

export async function renameBrand(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    await requireAdminAction();
    const brandId = formValue(formData, "brandId");
    const parsed = brandNameSchema.safeParse(formValue(formData, "name"));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("brands")
      .update({ name: parsed.data })
      .eq("id", brandId);

    if (error) throw new AppError("ブランド名の変更に失敗しました。");

    revalidatePath("/admin/brands");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/** 参照整合のため削除はせず、無効化のみ行う */
export async function toggleBrandActive(
  brandId: string,
  isActive: boolean,
): Promise<ActionResult<undefined>> {
  try {
    await requireAdminAction();
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("brands")
      .update({ is_active: isActive })
      .eq("id", brandId);

    if (error) throw new AppError("ブランドの更新に失敗しました。");

    revalidatePath("/admin/brands");
    revalidatePath("/sell");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}
