"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminAction } from "@/features/admin/guard";
import { ok, fail, toUserMessage, AppError, type ActionResult } from "@/lib/errors";
import { ACTIVE_TRANSACTION_STATUSES, type ListingStatus, type UserStatus } from "@/lib/constants";
import {
  canSuspendListing,
  canSuspendUser,
  canSuspendUserWithTransactions,
  SUSPENDABLE_LISTING_STATUSES,
} from "@/features/admin/rules";
import { recordAdminAction } from "@/features/admin/audit";
import { getTransaction, transitionTransaction } from "@/features/transaction/service";
import { cancelPendingTransaction } from "@/features/transaction/cancel";
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
    if (!parsed.data) throw new AppError("利用停止の理由を入力してください。");

    const supabase = createAdminClient();
    const { data: target } = await supabase
      .from("users")
      .select("id, role, status")
      .eq("id", userId)
      .maybeSingle();

    if (!target) throw new AppError("利用者が見つかりません。");

    const check = canSuspendUser(target.id, admin.id, target.role, target.status as UserStatus);
    if (!check.allowed) throw new AppError(check.reason);

    // 進行中の取引を抱えたまま停止すると、本人が発送操作をできず取引が止まる
    const { count: activeCount } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .in("status", [...ACTIVE_TRANSACTION_STATUSES]);

    const txCheck = canSuspendUserWithTransactions(activeCount ?? 0);
    if (!txCheck.allowed) throw new AppError(txCheck.reason);

    const { error } = await supabase
      .from("users")
      .update({ status: "suspended", suspended_reason: parsed.data })
      .eq("id", userId);

    if (error) throw new AppError("利用停止に失敗しました。");

    // Auth 側でもセッションを止める(A-5)。
    // DB の status だけでは既存の JWT で PostgREST / Storage を直接叩けてしまう。
    // app_metadata の状態は proxy が全パスで参照し、停止画面へ送るのに使う
    await setAuthAccountStatus(userId, "suspended");

    // 公開中・取下げ中・下書きの出品をまとめて非表示にする。
    // 解除時に元へ戻せるよう、直前のステータスを控えておく。
    // 運営が個別に非表示にした商品は status_before_suspend が null のままなので、
    // 一括復帰の対象にならない。
    for (const status of SUSPENDABLE_LISTING_STATUSES) {
      await supabase
        .from("listings")
        .update({
          status: "suspended",
          status_before_suspend: status,
          suspended_reason: "利用者の利用停止に伴う非表示",
        })
        .eq("seller_id", userId)
        .eq("status", status);
    }

    await recordAdminAction(admin.id, "suspend_user", "user", userId, parsed.data);

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/search");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/**
 * 利用停止の解除。
 *
 * 停止に伴って非表示にした出品(status_before_suspend が入っているもの)だけを
 * 元のステータスへ戻す。運営が個別に非表示にした商品はそのまま残す。
 */
export async function unsuspendUser(userId: string): Promise<ActionResult<undefined>> {
  try {
    const admin = await requireAdminAction();
    const supabase = createAdminClient();

    const { data: target } = await supabase
      .from("users")
      .select("id, status")
      .eq("id", userId)
      .maybeSingle();
    if (!target) throw new AppError("利用者が見つかりません。");
    if (target.status !== "suspended") throw new AppError("この利用者は停止中ではありません。");

    const { error } = await supabase
      .from("users")
      .update({ status: "active", suspended_reason: null })
      .eq("id", userId)
      .eq("status", "suspended");

    if (error) throw new AppError("利用停止の解除に失敗しました。");

    await setAuthAccountStatus(userId, "active");

    for (const status of SUSPENDABLE_LISTING_STATUSES) {
      await supabase
        .from("listings")
        .update({ status, status_before_suspend: null, suspended_reason: null })
        .eq("seller_id", userId)
        .eq("status", "suspended")
        .eq("status_before_suspend", status);
    }

    await recordAdminAction(admin.id, "unsuspend_user", "user", userId);

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/search");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/**
 * Supabase Auth 側のアカウント状態を更新する。
 * 停止は BAN(既存トークンの更新とログインを止める)+ app_metadata、解除はその逆。
 */
async function setAuthAccountStatus(userId: string, status: "active" | "suspended"): Promise<void> {
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
    ban_duration: status === "suspended" ? "876000h" : "none",
    app_metadata: { status },
  });
  if (error) {
    console.error("[auth account status]", userId, status, error);
    throw new AppError("認証基盤の更新に失敗しました。時間をおいて再度お試しください。");
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
    const admin = await requireAdminAction();
    const listingId = formValue(formData, "listingId");
    const parsed = reasonSchema.safeParse(formValue(formData, "reason"));
    if (!parsed.success) return fail("入力内容を確認してください");
    if (!parsed.data) throw new AppError("非表示にする理由を入力してください。");

    const supabase = createAdminClient();
    const { data: listing } = await supabase
      .from("listings")
      .select("id, status")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) throw new AppError("商品が見つかりません。");

    const check = canSuspendListing(listing.status as ListingStatus);
    if (!check.allowed) throw new AppError(check.reason);

    // 決済画面を開いている購入者がいれば先に閉じる(B-6)。
    // 閉じずに非表示にすると、その後の入金で非表示の商品が取引中→売却済になる
    const { data: pending } = await supabase
      .from("transactions")
      .select("id")
      .eq("listing_id", listingId)
      .eq("status", "pending_payment")
      .maybeSingle();
    if (pending) {
      const transaction = await getTransaction(pending.id);
      if (transaction && transaction.status === "pending_payment") {
        const result = await cancelPendingTransaction(transaction, "admin", {
          reason: "商品の非表示化に伴うキャンセル",
          actorId: admin.id,
          note: parsed.data ?? undefined,
        });
        if (result.outcome === "paid") {
          throw new AppError(
            "購入者の支払いが完了していたため非表示にできません。取引をキャンセルしてから実行してください。",
          );
        }
      }
    }

    // 運営が個別に非表示にしたものは、利用停止解除の一括復帰では戻さない。
    // 直前の状態は控えるが、復帰は unsuspendListing から明示的に行う。
    const { error } = await supabase
      .from("listings")
      .update({
        status: "suspended",
        status_before_suspend: null,
        suspended_reason: parsed.data,
      })
      .eq("id", listingId);

    if (error) throw new AppError("非表示化に失敗しました。");

    await recordAdminAction(admin.id, "suspend_listing", "listing", listingId, parsed.data);

    revalidatePath("/admin/listings");
    revalidatePath(`/items/${listingId}`);
    revalidatePath("/search");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/**
 * 非表示の解除。
 *
 * 停止前の状態を控えてある場合はそこへ戻す。控えが無い(運営が個別に非表示にした)
 * 場合は「取下げ中」へ戻し、公開するかどうかは出品者本人に委ねる。
 * 一律で公開中に戻すと、元が下書き・取下げ中だった商品まで公開されてしまう。
 */
export async function unsuspendListing(listingId: string): Promise<ActionResult<undefined>> {
  try {
    const admin = await requireAdminAction();
    const supabase = createAdminClient();

    const { data: listing } = await supabase
      .from("listings")
      .select("status, status_before_suspend")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) throw new AppError("商品が見つかりません。");
    if (listing.status !== "suspended") throw new AppError("非表示の商品ではありません。");

    const restored = (listing.status_before_suspend as ListingStatus | null) ?? "withdrawn";

    const { error } = await supabase
      .from("listings")
      .update({ status: restored, status_before_suspend: null, suspended_reason: null })
      .eq("id", listingId)
      .eq("status", "suspended");

    if (error) throw new AppError("非表示の解除に失敗しました。");

    await recordAdminAction(admin.id, "unsuspend_listing", "listing", listingId, `→ ${restored}`);

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

    if (transaction.status === "pending_payment") {
      // 未決済は Stripe の決済画面を先に閉じる(A-1)。閉じる前に支払われていたら paid にする
      const result = await cancelPendingTransaction(transaction, "admin", {
        reason: parsed.data,
        actorId: admin.id,
        note: parsed.data,
      });
      if (result.outcome === "paid") {
        revalidatePath("/admin/transactions");
        revalidatePath(`/transactions/${transactionId}`);
        throw new AppError(
          "キャンセルする前に購入者の支払いが完了していたため、取引を「支払い済み」にしました。返金が必要な場合は改めてキャンセルしてください。",
        );
      }
    } else {
      await transitionTransaction(transaction, "canceled", "admin", {
        patch: { canceled_reason: parsed.data },
        actorId: admin.id,
        note: parsed.data,
      });
    }

    await notifyCanceled(transactionId, parsed.data);
    await recordAdminAction(
      admin.id,
      "cancel_transaction",
      "transaction",
      transactionId,
      parsed.data,
    );

    revalidatePath("/admin/transactions");
    revalidatePath(`/transactions/${transactionId}`);
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

// ============================================================
// 評価管理(FR-10)
// ============================================================

/** FR-10: 管理者による評価の非表示化 / 解除。評価は削除せず、表示と平均★から除外する */
export async function setReviewHidden(
  reviewId: string,
  hidden: boolean,
): Promise<ActionResult<undefined>> {
  try {
    const admin = await requireAdminAction();
    const supabase = createAdminClient();

    const { data: review } = await supabase
      .from("reviews")
      .select("id, reviewee_id, is_hidden")
      .eq("id", reviewId)
      .maybeSingle();
    if (!review) throw new AppError("評価が見つかりません。");
    if (review.is_hidden === hidden) {
      throw new AppError(hidden ? "すでに非表示です。" : "非表示ではありません。");
    }

    const { error } = await supabase
      .from("reviews")
      .update({ is_hidden: hidden })
      .eq("id", reviewId);
    if (error) throw new AppError("評価の更新に失敗しました。");

    await recordAdminAction(admin.id, hidden ? "hide_review" : "unhide_review", "review", reviewId);

    revalidatePath(`/admin/users/${review.reviewee_id}`);
    revalidatePath(`/users/${review.reviewee_id}`);
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

    await recordAdminAction(admin.id, "resolve_report", "report", reportId, parsed.data);

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
    const admin = await requireAdminAction();
    const parsed = brandNameSchema.safeParse(formValue(formData, "name"));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }

    const supabase = createAdminClient();
    const { data: created, error } = await supabase
      .from("brands")
      .insert({ name: parsed.data })
      .select("id")
      .single();

    if (error) {
      throw new AppError(
        error.code === "23505"
          ? "同名のブランドがすでに登録されています。"
          : "ブランドの追加に失敗しました。",
      );
    }

    await recordAdminAction(admin.id, "create_brand", "brand", created?.id ?? null, parsed.data);

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
    const admin = await requireAdminAction();
    const brandId = formValue(formData, "brandId");
    const parsed = brandNameSchema.safeParse(formValue(formData, "name"));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("brands").update({ name: parsed.data }).eq("id", brandId);

    if (error) throw new AppError("ブランド名の変更に失敗しました。");

    await recordAdminAction(admin.id, "rename_brand", "brand", brandId, parsed.data);

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
    const admin = await requireAdminAction();
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("brands")
      .update({ is_active: isActive })
      .eq("id", brandId);

    if (error) throw new AppError("ブランドの更新に失敗しました。");

    await recordAdminAction(
      admin.id,
      "toggle_brand",
      "brand",
      brandId,
      isActive ? "有効化" : "無効化",
    );

    revalidatePath("/admin/brands");
    revalidatePath("/sell");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}
