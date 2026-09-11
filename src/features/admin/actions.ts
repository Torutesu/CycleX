"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminAction } from "@/features/admin/guard";
import {
  ok,
  fail,
  toUserMessage,
  AppError,
  isUniqueViolation,
  type ActionResult,
} from "@/lib/errors";
import { ACTIVE_TRANSACTION_STATUSES, type ListingStatus, type UserStatus } from "@/lib/constants";
import {
  canGrantAdmin,
  canRevokeAdmin,
  canSuspendListing,
  canSuspendUser,
  canSuspendUserWithTransactions,
  SUSPENDABLE_LISTING_STATUSES,
} from "@/features/admin/rules";
import { recordAdminAction } from "@/features/admin/audit";
import { hideListingImages, restoreListingImages, type MoveImagesResult } from "@/lib/storage";
import { getTransaction, transitionTransaction } from "@/features/transaction/service";
import { cancelPendingTransaction } from "@/features/transaction/cancel";
import {
  notifyAdminRoleChanged,
  notifyCanceled,
  notifyCompleted,
  notifyReceived,
} from "@/features/notification/notify";
import { formValue } from "@/lib/form";

/**
 * 画像の退避・復帰が一部失敗したときの案内文(監査 H-3)。
 *
 * 退避に失敗した画像は公開バケットに残るので、URL を知っている人には見え続ける。
 * 復帰に失敗した画像は非公開バケットに取り残され、商品ページで 404 になる。
 * どちらもステータス変更自体は成功しているため、成功と伝えるわけにはいかない。
 * `null` を返したときだけ完全な成功。
 */
function imageMoveWarning(result: MoveImagesResult, direction: "hide" | "restore"): string | null {
  if (result.failed === 0) return null;
  return direction === "hide"
    ? `非表示にしましたが、画像 ${result.failed} 件の退避に失敗しました。画像がまだ公開URLから見える可能性があります。ログを確認してください。`
    : `非表示を解除しましたが、画像 ${result.failed} 件の復帰に失敗しました。商品ページで画像が表示されない可能性があります。ログを確認してください。`;
}

const reasonSchema = z
  .string()
  .trim()
  .max(500, "理由は500文字以内で入力してください")
  .optional()
  .transform((value) => (value ? value : null));

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

    // 停止に伴って隠した出品(status_before_suspend が入っているもの)の画像も退避する
    const { data: hidden } = await supabase
      .from("listings")
      .select("id")
      .eq("seller_id", userId)
      .eq("status", "suspended")
      .not("status_before_suspend", "is", null);
    const hideResult = await hideListingImages((hidden ?? []).map((row) => row.id));

    await recordAdminAction(admin.id, "suspend_user", "user", userId, parsed.data);

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/search");

    const warning = imageMoveWarning(hideResult, "hide");
    if (warning) return fail(warning);
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/**
 * 管理者ロールの付与(issue #18)。
 *
 * これまで `users.role` を admin にするには SQL を直接実行する必要があった。
 * 担当者の追加・交代のたびに本番の DB を手で触るのは事故の元なので、
 * 管理画面から行えるようにする。
 *
 * 権限は admin / user の 2 段階のまま(細かい権限分けはしない)。
 */
export async function grantAdmin(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const admin = await requireAdminAction();
    const userId = formValue(formData, "userId");

    const supabase = createAdminClient();
    const { data: target } = await supabase
      .from("users")
      .select("id, role, status, display_name")
      .eq("id", userId)
      .maybeSingle();

    if (!target) throw new AppError("利用者が見つかりません。");

    const check = canGrantAdmin(target.id, admin.id, target.role, target.status as UserStatus);
    if (!check.allowed) throw new AppError(check.reason);

    // role を条件に含めて、同時に 2 人が操作しても二重に記録されないようにする
    const { data: updated, error } = await supabase
      .from("users")
      .update({ role: "admin" })
      .eq("id", userId)
      .eq("role", "user")
      .select("id")
      .maybeSingle();

    if (error) throw new AppError("ロールの変更に失敗しました。");
    if (!updated) throw new AppError("すでに管理者です。");

    await recordAdminAction(admin.id, "grant_admin", "user", userId, "管理者に昇格");
    // 本人が知らないまま権限を持つ状態を避ける
    await notifyAdminRoleChanged(userId, "granted");

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/**
 * 管理者ロールの剥奪(issue #18)。
 *
 * 最後の管理者を降格すると誰も管理画面に入れなくなり、復旧に SQL が必要に
 * なるため、本人以外の利用中の管理者が 1 人以上いることを確かめる。
 */
export async function revokeAdmin(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const admin = await requireAdminAction();
    const userId = formValue(formData, "userId");

    const supabase = createAdminClient();
    const { data: target } = await supabase
      .from("users")
      .select("id, role, status")
      .eq("id", userId)
      .maybeSingle();

    if (!target) throw new AppError("利用者が見つかりません。");

    // 本人以外の「利用中の」管理者を数える。停止中の管理者は入れないので数えない
    const { count: otherActiveAdmins } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("status", "active")
      .neq("id", userId);

    const check = canRevokeAdmin(target.id, admin.id, target.role, otherActiveAdmins ?? 0);
    if (!check.allowed) throw new AppError(check.reason);

    const { data: updated, error } = await supabase
      .from("users")
      .update({ role: "user" })
      .eq("id", userId)
      .eq("role", "admin")
      .select("id")
      .maybeSingle();

    if (error) throw new AppError("ロールの変更に失敗しました。");
    if (!updated) throw new AppError("管理者ではありません。");

    await recordAdminAction(admin.id, "revoke_admin", "user", userId, "管理者を解除");
    await notifyAdminRoleChanged(userId, "revoked");

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
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

    // 状態を戻す前に対象を控え、画像を公開バケットへ戻す
    const { data: toRestore } = await supabase
      .from("listings")
      .select("id")
      .eq("seller_id", userId)
      .eq("status", "suspended")
      .not("status_before_suspend", "is", null);
    const restoreResult = await restoreListingImages((toRestore ?? []).map((row) => row.id));

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

    const warning = imageMoveWarning(restoreResult, "restore");
    if (warning) return fail(warning);
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

    // 画像は公開バケットに残ると URL を知っていれば見られる。非公開バケットへ退避する
    const hideResult = await hideListingImages([listingId]);

    await recordAdminAction(admin.id, "suspend_listing", "listing", listingId, parsed.data);

    revalidatePath("/admin/listings");
    revalidatePath(`/items/${listingId}`);
    revalidatePath("/search");

    const warning = imageMoveWarning(hideResult, "hide");
    if (warning) return fail(warning);
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/**
 * 非表示の解除。
 *
 * 停止前の状態を控えてある場合はそこへ戻す。控えが無い(運営が個別に非表示にした)
 * 場合は「下書き」へ戻し、公開するかどうかは出品者本人に委ねる。
 * 一律で公開中に戻すと、元が下書き・取下げ中だった商品まで公開されてしまう。
 *
 * 既定を「取下げ中」にすると、必須項目が埋まっていない下書きが再公開の対象になり、
 * 価格も画像も無い商品を公開できてしまう(監査 M-5)。下書きは下書きへ戻す。
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

    const restored = (listing.status_before_suspend as ListingStatus | null) ?? "draft";

    const { error } = await supabase
      .from("listings")
      .update({ status: restored, status_before_suspend: null, suspended_reason: null })
      .eq("id", listingId)
      .eq("status", "suspended");

    if (error) throw new AppError("非表示の解除に失敗しました。");

    const restoreResult = await restoreListingImages([listingId]);

    await recordAdminAction(admin.id, "unsuspend_listing", "listing", listingId, `→ ${restored}`);

    revalidatePath("/admin/listings");
    revalidatePath(`/items/${listingId}`);
    revalidatePath("/search");

    const warning = imageMoveWarning(restoreResult, "restore");
    if (warning) return fail(warning);
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

    // Stripe が応答しないと通常のキャンセルは必ず失敗し、その商品は誰も買えなくなる。
    // 管理者だけは状態未確認を承知でキャンセルできる(監査 C-1)
    const force = formValue(formData, "force") === "1";

    if (transaction.status === "pending_payment") {
      // 未決済は Stripe の決済画面を先に閉じる(A-1)。閉じる前に支払われていたら paid にする
      const result = await cancelPendingTransaction(transaction, "admin", {
        reason: parsed.data,
        actorId: admin.id,
        note: parsed.data,
        force,
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
      force ? `${parsed.data}(決済セッション未確認のまま強制キャンセル)` : parsed.data,
    );

    revalidatePath("/admin/transactions");
    revalidatePath(`/transactions/${transactionId}`);
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/**
 * 返金済みにする(C-3)。Stripe ダッシュボードで返金したあと、
 * charge.refunded の Webhook が届かなかった場合の手動経路。
 */
export async function markRefunded(transactionId: string): Promise<ActionResult<undefined>> {
  try {
    const admin = await requireAdminAction();
    const transaction = await getTransaction(transactionId);
    if (!transaction) throw new AppError("取引が見つかりません。");
    if (transaction.status !== "canceled" || !transaction.paidAt) {
      throw new AppError("返金対象の取引ではありません。");
    }

    const { data: updated, error } = await createAdminClient()
      .from("transactions")
      .update({ refunded_at: new Date().toISOString() })
      .eq("id", transactionId)
      .is("refunded_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw new AppError("更新に失敗しました。");
    // 0 行更新を成功として扱うと、二重クリックのたびに監査ログが増える(監査 L-2)
    if (!updated) throw new AppError("この取引はすでに返金済みとして記録されています。");

    await recordAdminAction(admin.id, "mark_refunded", "transaction", transactionId);
    revalidatePath("/admin/transactions");
    revalidatePath(`/admin/transactions/${transactionId}`);
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/**
 * 止まった取引を運営が代理で進める(C-3)。
 * 受取確認をしない購入者、評価が揃わない取引を、確認のうえ次へ進める。
 */
export async function forceTransition(
  transactionId: string,
  to: "received" | "completed",
): Promise<ActionResult<undefined>> {
  try {
    const admin = await requireAdminAction();
    const transaction = await getTransaction(transactionId);
    if (!transaction) throw new AppError("取引が見つかりません。");

    await transitionTransaction(transaction, to, "admin", {
      actorId: admin.id,
      note: "運営による代理操作",
    });
    if (to === "received") await notifyReceived(transactionId);
    if (to === "completed") await notifyCompleted(transactionId);

    await recordAdminAction(
      admin.id,
      to === "received" ? "force_received" : "force_completed",
      "transaction",
      transactionId,
    );
    revalidatePath("/admin/transactions");
    revalidatePath(`/admin/transactions/${transactionId}`);
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
    // 対応済みのものを上書きしないよう、未対応の通報だけを対象にする
    const { data: updated, error } = await supabase
      .from("reports")
      .update({
        status: "resolved",
        resolved_by: admin.id,
        resolved_note: parsed.data,
      })
      .eq("id", reportId)
      .eq("status", "open")
      .select("id")
      .maybeSingle();

    if (error) throw new AppError("対応状況の更新に失敗しました。");
    if (!updated) throw new AppError("この通報は見つからないか、すでに対応済みです。");

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
        isUniqueViolation(error)
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
    const { data: updated, error } = await supabase
      .from("brands")
      .update({ name: parsed.data })
      .eq("id", brandId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new AppError(
        isUniqueViolation(error)
          ? "同名のブランドがすでに登録されています。"
          : "ブランド名の変更に失敗しました。",
      );
    }
    if (!updated) throw new AppError("ブランドが見つかりません。");

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

    const { data: updated, error } = await supabase
      .from("brands")
      .update({ is_active: isActive })
      .eq("id", brandId)
      .select("id")
      .maybeSingle();

    if (error) throw new AppError("ブランドの更新に失敗しました。");
    if (!updated) throw new AppError("ブランドが見つかりません。");

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
