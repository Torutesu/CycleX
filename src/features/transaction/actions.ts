"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { requireVerifiedUser } from "@/lib/session";
import {
  ok,
  fail,
  toUserMessage,
  AppError,
  isUniqueViolation,
  type ActionResult,
} from "@/lib/errors";
import { absoluteUrl } from "@/lib/utils";
import { CHECKOUT_EXPIRES_MINUTES, SHIPPING_NOTE_MAX, type ListingStatus } from "@/lib/constants";
import { listingImageUrl } from "@/lib/images";
import { isDemoCheckout, demoSessionId } from "@/lib/demo";
import { getTransaction, recordEvent, transitionTransaction } from "@/features/transaction/service";
import { notifyShipped, notifyReceived } from "@/features/notification/notify";

/**
 * FR-08/FR-09: 購入手続きの開始。
 *
 * 排他制御の本体は transactions の部分ユニークインデックス
 * (listing_id where status <> 'canceled')。INSERT に成功した1人だけが
 * Stripe Checkout へ進める。
 */
export async function startPurchase(listingId: string): Promise<ActionResult<undefined>> {
  let checkoutUrl: string;

  try {
    const user = await requireVerifiedUser();
    const supabase = createAdminClient();

    const { data: listing } = await supabase
      .from("listings")
      .select("id, seller_id, status, title, price, listing_images(path, position)")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) throw new AppError("商品が見つかりません。");
    if (listing.seller_id === user.id) throw new AppError("自分が出品した商品は購入できません。");
    if ((listing.status as ListingStatus) !== "published") {
      throw new AppError("この商品は現在購入できません。");
    }
    if (listing.price === null) throw new AppError("この商品には価格が設定されていません。");

    const { data: seller } = await supabase
      .from("users")
      .select("status")
      .eq("id", listing.seller_id)
      .maybeSingle();

    if (seller?.status !== "active") {
      throw new AppError("出品者のアカウント状態により、現在購入できません。");
    }

    // 有効な取引を1件だけ作れる(重複時は 23505)
    const { data: transaction, error: insertError } = await supabase
      .from("transactions")
      .insert({
        listing_id: listing.id,
        seller_id: listing.seller_id,
        buyer_id: user.id,
        status: "pending_payment",
        price: listing.price,
      })
      .select("id")
      .single();

    if (insertError || !transaction) {
      if (isUniqueViolation(insertError)) {
        throw new AppError("他の方が購入手続き中です。しばらくしてからお試しください。");
      }
      console.error("[transaction insert failed]", insertError);
      throw new AppError("購入手続きを開始できませんでした。時間をおいて再度お試しください。");
    }

    const thumbnail = [...(listing.listing_images ?? [])].sort(
      (a, b) => a.position - b.position,
    )[0];

    // Stripe 未設定のデモ環境では、決済ページの代わりに確認画面へ送る。
    // 取引の作成・排他・状態遷移はここまでと以降で共通。
    if (isDemoCheckout()) {
      await supabase
        .from("transactions")
        .update({ stripe_session_id: demoSessionId(transaction.id) })
        .eq("id", transaction.id);
      await recordEvent(transaction.id, "created", user.id);
      checkoutUrl = `/purchase/demo?tx=${transaction.id}`;
    } else {
      try {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          payment_method_types: ["card"],
          // 国内向けのため、決済画面もブラウザ設定によらず日本語で出す
          locale: "ja",
          expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRES_MINUTES * 60,
          client_reference_id: transaction.id,
          metadata: {
            transaction_id: transaction.id,
            listing_id: listing.id,
            buyer_id: user.id,
          },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "jpy",
                unit_amount: listing.price,
                product_data: {
                  name: listing.title,
                  ...(thumbnail ? { images: [listingImageUrl(thumbnail.path)] } : {}),
                },
              },
            },
          ],
          success_url: absoluteUrl(`/purchase/complete?tx=${transaction.id}`),
          cancel_url: absoluteUrl(`/items/${listing.id}?canceled=1`),
        });

        if (!session.url) throw new Error("Checkout session に URL がありません");

        await supabase
          .from("transactions")
          .update({ stripe_session_id: session.id })
          .eq("id", transaction.id);

        await recordEvent(transaction.id, "created", user.id);
        checkoutUrl = session.url;
      } catch (stripeError) {
        // Checkout を作れなかった取引は残さない(商品を購入可能な状態へ戻す)
        console.error("[stripe checkout failed]", stripeError);
        await supabase
          .from("transactions")
          .update({
            status: "canceled",
            canceled_at: new Date().toISOString(),
            canceled_reason: "checkout_creation_failed",
          })
          .eq("id", transaction.id);

        throw new AppError("決済ページの準備に失敗しました。時間をおいて再度お試しください。");
      }
    }
  } catch (error) {
    return fail(toUserMessage(error));
  }

  redirect(checkoutUrl);
}

const shippingNoteSchema = z
  .string()
  .trim()
  .max(SHIPPING_NOTE_MAX, `連絡メモは${SHIPPING_NOTE_MAX}文字以内で入力してください`);

/** FR-08: 出品者による発送・受渡連絡 */
export async function markShipped(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const user = await requireVerifiedUser();
    const transactionId = String(formData.get("transactionId") ?? "");
    const parsedNote = shippingNoteSchema.safeParse(formData.get("note") ?? "");

    if (!parsedNote.success) {
      return fail(parsedNote.error.issues[0]?.message ?? "入力内容を確認してください");
    }

    const transaction = await getTransaction(transactionId);
    if (!transaction) throw new AppError("取引が見つかりません。");
    if (transaction.sellerId !== user.id) {
      throw new AppError("この取引を操作する権限がありません。");
    }

    await transitionTransaction(transaction, "shipped", "seller", {
      patch: { shipping_note: parsedNote.data || null },
      actorId: user.id,
      note: parsedNote.data || undefined,
    });

    await notifyShipped(transactionId);

    revalidatePath(`/transactions/${transactionId}`);
    revalidatePath("/mypage/listings");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}

/** FR-08: 購入者による受取確認 */
export async function markReceived(transactionId: string): Promise<ActionResult<undefined>> {
  try {
    const user = await requireVerifiedUser();

    const transaction = await getTransaction(transactionId);
    if (!transaction) throw new AppError("取引が見つかりません。");
    if (transaction.buyerId !== user.id) {
      throw new AppError("この取引を操作する権限がありません。");
    }

    await transitionTransaction(transaction, "received", "buyer", { actorId: user.id });
    await notifyReceived(transactionId);

    revalidatePath(`/transactions/${transactionId}`);
    revalidatePath("/mypage/purchases");
    return ok();
  } catch (error) {
    return fail(toUserMessage(error));
  }
}
