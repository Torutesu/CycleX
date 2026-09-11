import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, getWebhookSecret } from "@/lib/stripe";
import { arePaymentsDisabled } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { flushErrorReports, reportError } from "@/lib/observability";
import {
  handleChargeRefunded,
  handleCheckoutCompleted,
  handleCheckoutExpired,
  handleDisputeCreated,
} from "@/features/transaction/webhook";

/**
 * Stripe Webhook(FR-09)。
 * 決済の確定はこのエンドポイントのみが行う。署名検証は必須。
 *
 * 2xx を返すと Stripe は二度と再送しない。DB の一時障害のように
 * 後で成功しうる失敗は 500 を返して再送させる(A-2)。
 */

function retryLater(reason: string) {
  return NextResponse.json({ error: "後で再試行してください", reason }, { status: 500 });
}
/**
 * 受け取ったイベントを `stripe_events` に残す。
 *
 * @returns すでに記録済み(= 再送・重複配信)なら true
 */
async function recordStripeEvent(event: Stripe.Event): Promise<boolean> {
  const transactionId = transactionIdOf(event);
  const { error } = await createAdminClient()
    .from("stripe_events")
    .insert({ event_id: event.id, type: event.type, transaction_id: transactionId });

  if (!error) return false;
  // 23505 = 主キー衝突。すでに受け取っているイベント
  if (error.code === "23505") return true;
  console.error("[stripe webhook] イベントの記録に失敗しました", event.id, error);
  return false;
}

/** イベントから取引 ID を拾えるだけ拾う(台帳から追いやすくするため) */
function transactionIdOf(event: Stripe.Event): string | null {
  const object = event.data.object as { metadata?: Record<string, string> | null };
  const id = object.metadata?.transaction_id;
  return id && UUID_PATTERN.test(id) ? id : null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  // 決済を無効にして公開している段階では、署名の検証もできない
  // (STRIPE_WEBHOOK_SECRET が無い)。503 で明示的に断り、
  // Stripe 側にも「受け取れていない」ことが残るようにする
  if (arePaymentsDisabled()) {
    return NextResponse.json(
      { error: "決済は現在無効です(CYCLEX_PAYMENTS_DISABLED)" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "署名がありません" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = getStripe().webhooks.constructEvent(rawBody, signature, getWebhookSecret());
  } catch (error) {
    console.error("[stripe webhook] 署名検証に失敗しました", error);
    return NextResponse.json({ error: "署名の検証に失敗しました" }, { status: 400 });
  }

  // 受信を記録する(issue #10)。主キー衝突で再送・重複配信を検出できる。
  // 記録に失敗しても処理は続ける — 追跡のための台帳であって、
  // 二重処理を防いでいるのは各ハンドラの「遷移前 status を条件に含める」実装の方
  const alreadySeen = await recordStripeEvent(event);
  if (alreadySeen) {
    console.info("[stripe webhook] 同じイベントを再度受信しました", event.id, event.type);
  }

  try {
    switch (event.type) {
      // completed は「セッション完了」であって入金確定ではない。
      // 後払い手段では未入金のまま飛ぶため、確定は async_payment_succeeded で行う。
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const outcome = await handleCheckoutCompleted(event.data.object);
        if (!outcome.handled) {
          console.error("[stripe webhook] completed 処理をスキップ:", outcome.reason);
          if (outcome.retry) return retryLater(outcome.reason);
        }
        break;
      }
      case "checkout.session.expired": {
        const outcome = await handleCheckoutExpired(event.data.object, "payment_expired");
        if (!outcome.handled) {
          console.error("[stripe webhook] expired 処理をスキップ:", outcome.reason);
          if (outcome.retry) return retryLater(outcome.reason);
        }
        break;
      }
      case "checkout.session.async_payment_failed": {
        const outcome = await handleCheckoutExpired(event.data.object, "payment_failed");
        if (!outcome.handled) {
          console.error("[stripe webhook] async_payment_failed 処理をスキップ:", outcome.reason);
          if (outcome.retry) return retryLater(outcome.reason);
        }
        break;
      }
      // カード会社からの不正利用の申し立て。応答期限があるため運営へ通知する
      case "charge.dispute.created": {
        await handleDisputeCreated(event.data.object);
        break;
      }
      // 運営がダッシュボードで返金した。管理画面の「要返金」から外す
      case "charge.refunded": {
        await handleChargeRefunded(event.data.object);
        break;
      }
      default:
        // 購読していないイベントは無視する
        break;
    }
  } catch (error) {
    // 500 を返すと Stripe が再送するため、復旧可能な失敗はここに落とす。
    // 再送が続くと取引が進まないので、気づけるように通知する(issue #5)
    reportError("stripe_webhook", error, { eventType: event.type, eventId: event.id });
    await markStripeEventOutcome(event.id, "failed");
    await flushErrorReports();
    return NextResponse.json({ error: "処理に失敗しました" }, { status: 500 });
  }

  await markStripeEventOutcome(event.id, "handled");
  return NextResponse.json({ received: true });
}

/** 台帳に結果を書き戻す。失敗しても応答は変えない(追跡用の情報) */
async function markStripeEventOutcome(eventId: string, outcome: "handled" | "failed") {
  const { error } = await createAdminClient()
    .from("stripe_events")
    .update({ outcome })
    .eq("event_id", eventId);
  if (error) console.error("[stripe webhook] 結果の記録に失敗しました", eventId, error);
}
