"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, requireVerifiedUser } from "@/lib/session";
import { assertRateLimit } from "@/lib/rate-limit";
import { ok, fail, toUserMessage, AppError, type ActionResult } from "@/lib/errors";
import { MESSAGE_MAX, type ListingStatus, type UserStatus } from "@/lib/constants";
import { canSendMessage, canStartThread } from "@/features/message/rules";
import { markThreadRead } from "@/features/message/service";
import { notifyNewMessage } from "@/features/notification/notify";

const bodySchema = z
  .string()
  .trim()
  .min(1, "メッセージを入力してください")
  .max(MESSAGE_MAX, `メッセージは${MESSAGE_MAX}文字以内で入力してください`);

/** スレッドの当事者と相手の状態をまとめて取得する */
async function loadThreadContext(threadId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("threads")
    .select("id, buyer_id, listings!inner(id, seller_id, status)")
    .eq("id", threadId)
    .maybeSingle();

  if (!data?.listings) throw new AppError("やり取りが見つかりません。");

  return {
    threadId: data.id,
    buyerId: data.buyer_id,
    sellerId: data.listings.seller_id,
    listingId: data.listings.id,
    listingStatus: data.listings.status as ListingStatus,
  };
}

async function getUserStatus(userId: string): Promise<UserStatus> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("users").select("status").eq("id", userId).maybeSingle();
  return (data?.status ?? "withdrawn") as UserStatus;
}

/** メッセージを INSERT し、スレッドの最終更新を進める */
async function insertMessage(threadId: string, senderId: string, body: string): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, sender_id: senderId, body });

  if (error) {
    console.error("[message insert failed]", error);
    throw new AppError("メッセージの送信に失敗しました。時間をおいて再度お試しください。");
  }

  await supabase.from("threads").update({ last_message_at: now }).eq("id", threadId);
}

/**
 * FR-07: 商品詳細から質問を開始する。
 * 同一商品×同一購入希望者のスレッドは1本に集約する。
 */
export async function startThread(
  _prev: ActionResult<{ threadId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ threadId: string }>> {
  let threadId: string;

  try {
    const user = await requireVerifiedUser();
    const listingId = String(formData.get("listingId") ?? "");
    const parsedBody = bodySchema.safeParse(formData.get("body"));

    if (!parsedBody.success) {
      return fail(parsedBody.error.issues[0]?.message ?? "メッセージを入力してください");
    }

    const supabase = createAdminClient();
    const { data: listing } = await supabase
      .from("listings")
      .select("id, seller_id, status")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) throw new AppError("商品が見つかりません。");

    const startCheck = canStartThread(listing.status as ListingStatus, listing.seller_id, user.id);
    if (!startCheck.allowed) throw new AppError(startCheck.reason);

    const sellerStatus = await getUserStatus(listing.seller_id);
    const sendCheck = canSendMessage(user.id, {
      buyerId: user.id,
      sellerId: listing.seller_id,
      counterpartyStatus: sellerStatus,
      listingStatus: listing.status as ListingStatus,
    });
    if (!sendCheck.allowed) throw new AppError(sendCheck.reason);

    await assertRateLimit(user.id, "message_send");

    // 既存スレッドがあれば再利用する
    const { data: existing } = await supabase
      .from("threads")
      .select("id")
      .eq("listing_id", listingId)
      .eq("buyer_id", user.id)
      .maybeSingle();

    if (existing) {
      threadId = existing.id;
    } else {
      const { data: created, error } = await supabase
        .from("threads")
        .insert({ listing_id: listingId, buyer_id: user.id })
        .select("id")
        .single();

      if (error || !created) {
        console.error("[thread insert failed]", error);
        throw new AppError("やり取りの開始に失敗しました。時間をおいて再度お試しください。");
      }
      threadId = created.id;
    }

    await insertMessage(threadId, user.id, parsedBody.data);
    await notifyNewMessage(threadId, user.id);
  } catch (error) {
    return fail(toUserMessage(error));
  }

  revalidatePath("/messages");
  revalidatePath("/", "layout");
  redirect(`/messages/${threadId}`);
}

/** スレッド内での返信 */
export async function sendMessage(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const user = await requireVerifiedUser();
    const threadId = String(formData.get("threadId") ?? "");
    const parsedBody = bodySchema.safeParse(formData.get("body"));

    if (!parsedBody.success) {
      return fail(parsedBody.error.issues[0]?.message ?? "メッセージを入力してください");
    }

    const context = await loadThreadContext(threadId);
    const counterpartyId = context.buyerId === user.id ? context.sellerId : context.buyerId;
    const counterpartyStatus = await getUserStatus(counterpartyId);

    const check = canSendMessage(user.id, {
      buyerId: context.buyerId,
      sellerId: context.sellerId,
      counterpartyStatus,
      listingStatus: context.listingStatus,
    });
    if (!check.allowed) throw new AppError(check.reason);

    await assertRateLimit(user.id, "message_send");
    await insertMessage(threadId, user.id, parsedBody.data);
    await notifyNewMessage(threadId, user.id);

    revalidatePath(`/messages/${threadId}`);
    revalidatePath("/messages");
    revalidatePath("/", "layout");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/**
 * スレッドを開いたときの既読化。
 *
 * 描画中に書き込むと未読件数がヘッダーへ反映されず、戻ってもバッジが
 * 残ったままになる。クライアントから呼び、ここで再検証まで行う。
 */
export async function markThreadReadAction(threadId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const context = await loadThreadContext(threadId).catch(() => null);
  if (!context) return;
  if (context.buyerId !== user.id && context.sellerId !== user.id) return;

  await markThreadRead(threadId, user.id);

  revalidatePath(`/messages/${threadId}`);
  revalidatePath("/messages");
  revalidatePath("/", "layout");
}
