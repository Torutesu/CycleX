"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireVerifiedUser } from "@/lib/session";
import { assertRateLimit } from "@/lib/rate-limit";
import { ok, fail, toUserMessage, AppError, type ActionResult } from "@/lib/errors";
import { MAX_DRAFTS, type ListingStatus } from "@/lib/constants";
import { IMAGE_BUCKETS, isOwnedImagePath } from "@/lib/images";
import { removeStorageObjects } from "@/lib/storage";
import {
  draftSchema,
  publishSchema,
  toListingRow,
  type ListingFormValues,
} from "@/features/listing/schema";
import {
  canDeleteListing,
  canEditListing,
  canRepublishListing,
  canWithdrawListing,
} from "@/features/listing/rules";

type SaveResult = ActionResult<{ id: string }>;

/**
 * 画像行を position 付きで入れ直す(並び替え・削除をまとめて反映する)。
 * 参照が外れたオブジェクトは Storage からも消す(S2-2)。
 */
async function replaceImages(listingId: string, paths: string[]): Promise<void> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("listing_images")
    .select("path")
    .eq("listing_id", listingId);

  await admin.from("listing_images").delete().eq("listing_id", listingId);

  if (paths.length > 0) {
    const rows = paths.map((path, index) => ({
      listing_id: listingId,
      path,
      position: index,
    }));
    const { error } = await admin.from("listing_images").insert(rows);
    if (error) throw new AppError("画像の保存に失敗しました。時間をおいて再度お試しください。");
  }

  // DB の更新が終わってから消す。逆順だと、保存に失敗したときに実体だけ失う。
  const kept = new Set(paths);
  const orphans = (existing ?? []).map((row) => row.path).filter((path) => !kept.has(path));
  await removeStorageObjects(IMAGE_BUCKETS.listing, orphans);
}

/**
 * 出品フォームで「削除」された画像のうち、どの出品からも参照されていないものを消す。
 * 保存が成功したあとにまとめて呼ぶ(保存前に消すと、保存しないまま離脱したときに
 * DB は残っているのに実体が無い状態になる)。
 */
async function discardUnusedImages(paths: string[], userId: string): Promise<void> {
  const owned = paths.filter((path) => isOwnedImagePath(path, userId));
  if (owned.length === 0) return;

  const admin = createAdminClient();
  const { data: referenced } = await admin
    .from("listing_images")
    .select("path")
    .in("path", owned);

  const inUse = new Set((referenced ?? []).map((row) => row.path));
  await removeStorageObjects(
    IMAGE_BUCKETS.listing,
    owned.filter((path) => !inUse.has(path)),
  );
}

/**
 * 進行中の取引が紐づいている商品は、出品者側から動かせないようにする。
 *
 * 商品が `trading` になるのは決済確定(paid)後なので、購入者が Stripe の決済画面を
 * 開いている `pending_payment` の間、商品は `published` のままになる。この隙間を塞がないと、
 * 出品者が取下げ・値下げした直後に購入者が決済を完了できてしまう。
 */
async function assertNoActiveTransaction(listingId: string): Promise<void> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("listing_id", listingId)
    .neq("status", "canceled");

  // 判定できないときは安全側に倒して止める(金銭が絡むため通過させない)
  if (error) {
    console.error("[active transaction check failed]", error);
    throw new AppError("状態を確認できませんでした。時間をおいて再度お試しください。");
  }
  if ((count ?? 0) > 0) {
    throw new AppError("この商品は購入手続きが進行中のため、変更・取下げできません。");
  }
}

/** 所有者と編集可否を確認する */
async function assertEditable(listingId: string, userId: string): Promise<ListingStatus> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("listings")
    .select("seller_id, status")
    .eq("id", listingId)
    .maybeSingle();

  if (!data) throw new AppError("商品が見つかりません。");
  if (data.seller_id !== userId) throw new AppError("この商品を編集する権限がありません。");

  const status = data.status as ListingStatus;
  if (!canEditListing(status)) {
    throw new AppError(
      status === "suspended"
        ? "運営により非公開となっているため編集できません。"
        : "取引中または売却済みの商品は編集できません。",
    );
  }

  await assertNoActiveTransaction(listingId);
  return status;
}

async function upsertListing(
  values: ListingFormValues,
  userId: string,
  nextStatus: "draft" | "published",
): Promise<string> {
  const admin = createAdminClient();
  const row = toListingRow(values);

  // 画像パスは自分のフォルダ配下に限る(Storage のポリシーと同じ規約をここでも検証する)
  if (values.imagePaths.some((path) => !isOwnedImagePath(path, userId))) {
    throw new AppError("画像の指定が正しくありません。画像を選び直してください。");
  }

  if (values.id) {
    await assertEditable(values.id, userId);

    // 初回公開時のみ published_at を打つ
    const { data: existing } = await admin
      .from("listings")
      .select("published_at")
      .eq("id", values.id)
      .single();

    const { error } = await admin
      .from("listings")
      .update({
        ...row,
        status: nextStatus,
        published_at:
          nextStatus === "published" && !existing?.published_at
            ? new Date().toISOString()
            : existing?.published_at,
      })
      .eq("id", values.id);

    if (error) {
      console.error("[listing update failed]", error);
      throw new AppError("商品の保存に失敗しました。時間をおいて再度お試しください。");
    }
    await replaceImages(values.id, values.imagePaths);
    await discardUnusedImages(values.discardedImagePaths, userId);
    return values.id;
  }

  if (nextStatus === "draft") {
    const { count } = await admin
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("seller_id", userId)
      .eq("status", "draft");

    if ((count ?? 0) >= MAX_DRAFTS) {
      throw new AppError(`下書きは${MAX_DRAFTS}件までです。不要な下書きを削除してください。`);
    }
  }

  await assertRateLimit(userId, "listing_create");

  const { data, error } = await admin
    .from("listings")
    .insert({
      ...row,
      seller_id: userId,
      status: nextStatus,
      published_at: nextStatus === "published" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[listing insert failed]", error);
    throw new AppError("商品の保存に失敗しました。時間をおいて再度お試しください。");
  }

  await replaceImages(data.id, values.imagePaths);
  await discardUnusedImages(values.discardedImagePaths, userId);
  return data.id;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

/** 下書き保存(タイトルのみ必須) */
export async function saveDraft(values: unknown): Promise<SaveResult> {
  try {
    const user = await requireVerifiedUser();
    const parsed = draftSchema.safeParse(values);
    if (!parsed.success) {
      return fail("入力内容を確認してください", fieldErrorsOf(parsed.error));
    }

    const id = await upsertListing(parsed.data, user.id, "draft");
    revalidatePath("/mypage/listings");
    return ok({ id });
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/** 公開(全必須項目を検証) */
export async function publishListing(values: unknown): Promise<SaveResult> {
  try {
    const user = await requireVerifiedUser();
    const parsed = publishSchema.safeParse(values);
    if (!parsed.success) {
      return fail("入力内容を確認してください", fieldErrorsOf(parsed.error));
    }

    const id = await upsertListing(parsed.data, user.id, "published");
    revalidatePath("/mypage/listings");
    revalidatePath("/search");
    revalidatePath("/");
    revalidatePath(`/items/${id}`);
    return ok({ id });
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/** 状態遷移(取下げ・再公開)の共通処理 */
async function changeStatus(
  listingId: string,
  to: "withdrawn" | "published",
  guard: (status: ListingStatus) => boolean,
  errorMessage: string,
): Promise<ActionResult<undefined>> {
  try {
    const user = await requireVerifiedUser();
    const admin = createAdminClient();

    const { data } = await admin
      .from("listings")
      .select("seller_id, status")
      .eq("id", listingId)
      .maybeSingle();

    if (!data) throw new AppError("商品が見つかりません。");
    if (data.seller_id !== user.id) throw new AppError("この商品を操作する権限がありません。");
    if (!guard(data.status as ListingStatus)) throw new AppError(errorMessage);

    await assertNoActiveTransaction(listingId);

    const { error } = await admin.from("listings").update({ status: to }).eq("id", listingId);
    if (error) throw new AppError("状態の変更に失敗しました。時間をおいて再度お試しください。");

    revalidatePath("/mypage/listings");
    revalidatePath(`/items/${listingId}`);
    revalidatePath("/search");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

export async function withdrawListing(listingId: string): Promise<ActionResult<undefined>> {
  return changeStatus(
    listingId,
    "withdrawn",
    canWithdrawListing,
    "公開中の商品のみ取下げできます。",
  );
}

export async function republishListing(listingId: string): Promise<ActionResult<undefined>> {
  return changeStatus(
    listingId,
    "published",
    canRepublishListing,
    "取下げ中の商品のみ再公開できます。",
  );
}

/** 下書きの削除。Storage の画像も併せて片付ける。 */
export async function deleteDraft(listingId: string): Promise<ActionResult<undefined>> {
  try {
    const user = await requireVerifiedUser();
    const admin = createAdminClient();

    const { data } = await admin
      .from("listings")
      .select("seller_id, status")
      .eq("id", listingId)
      .maybeSingle();

    if (!data) throw new AppError("商品が見つかりません。");
    if (data.seller_id !== user.id) throw new AppError("この商品を操作する権限がありません。");
    if (!canDeleteListing(data.status as ListingStatus)) {
      throw new AppError("下書きのみ削除できます。");
    }

    const { data: images } = await admin
      .from("listing_images")
      .select("path")
      .eq("listing_id", listingId);

    const { error } = await admin.from("listings").delete().eq("id", listingId);
    if (error) throw new AppError("削除に失敗しました。時間をおいて再度お試しください。");

    if (images && images.length > 0) {
      await admin.storage.from(IMAGE_BUCKETS.listing).remove(images.map((image) => image.path));
    }

    revalidatePath("/mypage/listings");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/** 出品フォームで使うブランド一覧 */
export async function listActiveBrands(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("brands")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

/** 保存後に商品詳細へ遷移する(フォームから呼ぶ) */
export async function goToListing(listingId: string): Promise<never> {
  redirect(`/items/${listingId}`);
}
