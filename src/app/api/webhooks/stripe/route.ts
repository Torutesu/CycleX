import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, getWebhookSecret } from "@/lib/stripe";
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
export async function POST(request: NextRequest) {
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
    // 500 を返すと Stripe が再送するため、復旧可能な失敗はここに落とす
    console.error("[stripe webhook] 処理に失敗しました", event.type, error);
    return NextResponse.json({ error: "処理に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
