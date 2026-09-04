import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail, findLastSentAt } from "@/lib/email/send";
import { shouldThrottleMessageNotification } from "@/lib/email/kinds";
import { formatDateTime, formatPrice } from "@/lib/utils";

/**
 * FR-13 のメール通知フック。
 *
 * すべての関数は例外を投げない(ADR #9)。送信失敗は sendMail 内でログに記録し、
 * 呼び出し元の業務処理は成功させる。
 */

type TransactionContext = {
  id: string;
  buyerId: string;
  sellerId: string;
  price: number;
  listingTitle: string;
  shippingNote: string | null;
  isInPerson: boolean;
};

/** 通知に必要な取引の情報をまとめて引く */
async function loadTransaction(transactionId: string): Promise<TransactionContext | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("transactions")
    .select("id, buyer_id, seller_id, price, shipping_note, listings!inner(title, delivery_method)")
    .eq("id", transactionId)
    .maybeSingle();

  if (!data?.listings) return null;

  return {
    id: data.id,
    buyerId: data.buyer_id,
    sellerId: data.seller_id,
    price: data.price,
    listingTitle: data.listings.title,
    shippingNote: data.shipping_note,
    isInPerson: data.listings.delivery_method === "in_person",
  };
}

// ============================================================
// 会員登録
// ============================================================

export async function notifyWelcome(userId: string): Promise<void> {
  await sendMail({
    userId,
    kind: "welcome",
    body: {
      intro:
        "CycleX へのご登録ありがとうございます。自転車本体からパーツまで、出品と購入がすぐに始められます。",
      cta: { label: "商品をさがす", path: "/search" },
      outro:
        "出品する際は、フレームサイズやコンポーネントを入力すると見つけてもらいやすくなります。",
    },
  });
}

// ============================================================
// 取引
// ============================================================

/** 決済完了(購入者・出品者の双方へ) */
export async function notifyPaid(transactionId: string): Promise<void> {
  const tx = await loadTransaction(transactionId);
  if (!tx) return;

  const details = [
    { label: "商品", value: tx.listingTitle },
    { label: "金額", value: formatPrice(tx.price) },
  ];

  await Promise.all([
    sendMail({
      userId: tx.sellerId,
      kind: "listing_paid_seller",
      refId: tx.id,
      body: {
        intro: "出品中の商品が購入されました。取引画面から発送・受渡のご連絡をお願いします。",
        details,
        cta: { label: "取引画面を開く", path: `/transactions/${tx.id}` },
      },
    }),
    sendMail({
      userId: tx.buyerId,
      kind: "purchase_confirmed",
      refId: tx.id,
      body: {
        intro: "お支払いが完了しました。出品者からの発送・受渡のご連絡をお待ちください。",
        details,
        cta: { label: "取引画面を開く", path: `/transactions/${tx.id}` },
      },
    }),
  ]);
}

/** 発送・受渡連絡(購入者へ) */
export async function notifyShipped(transactionId: string): Promise<void> {
  const tx = await loadTransaction(transactionId);
  if (!tx) return;

  const details = [{ label: "商品", value: tx.listingTitle }];
  if (tx.shippingNote) details.push({ label: "出品者からの連絡", value: tx.shippingNote });

  await sendMail({
    userId: tx.buyerId,
    kind: "tx_shipped",
    refId: tx.id,
    body: {
      intro: tx.isInPerson
        ? "出品者から受渡についてのご連絡がありました。"
        : "出品者が商品を発送しました。",
      details,
      cta: { label: "取引画面を開く", path: `/transactions/${tx.id}` },
      outro: "商品を受け取ったら、取引画面から受取確認をお願いします。",
    },
  });
}

/** 受取確認(出品者へ) */
export async function notifyReceived(transactionId: string): Promise<void> {
  const tx = await loadTransaction(transactionId);
  if (!tx) return;

  await sendMail({
    userId: tx.sellerId,
    kind: "tx_received",
    refId: tx.id,
    body: {
      intro: "購入者が商品の受取を確認しました。取引相手の評価をお願いします。",
      details: [{ label: "商品", value: tx.listingTitle }],
      cta: { label: "評価を登録する", path: `/transactions/${tx.id}/review` },
      outro: "評価は双方が登録した時点で公開されます。",
    },
  });
}

/** 評価の依頼(まだ評価していない相手へ) */
export async function notifyReviewRequested(
  transactionId: string,
  reviewerId: string,
): Promise<void> {
  const tx = await loadTransaction(transactionId);
  if (!tx) return;

  const targetId = reviewerId === tx.buyerId ? tx.sellerId : tx.buyerId;

  await sendMail({
    userId: targetId,
    kind: "review_requested",
    refId: tx.id,
    body: {
      intro: "取引相手が評価を登録しました。あなたの評価をお待ちしています。",
      details: [{ label: "商品", value: tx.listingTitle }],
      cta: { label: "評価を登録する", path: `/transactions/${tx.id}/review` },
      outro: "双方の評価が揃うと、お互いの評価が公開され取引が完了します。",
    },
  });
}

/** 評価が届いた(被評価者へ) */
export async function notifyReviewReceived(
  transactionId: string,
  revieweeId: string,
): Promise<void> {
  const tx = await loadTransaction(transactionId);
  if (!tx) return;

  await sendMail({
    userId: revieweeId,
    kind: "review_received",
    refId: tx.id,
    body: {
      intro: "取引相手からの評価が公開されました。",
      details: [{ label: "商品", value: tx.listingTitle }],
      cta: { label: "受け取った評価を見る", path: `/users/${revieweeId}` },
    },
  });
}

/** 取引完了(双方へ) */
export async function notifyCompleted(transactionId: string): Promise<void> {
  const tx = await loadTransaction(transactionId);
  if (!tx) return;

  const body = {
    intro: "取引が完了しました。ご利用ありがとうございました。",
    details: [
      { label: "商品", value: tx.listingTitle },
      { label: "金額", value: formatPrice(tx.price) },
    ],
    cta: { label: "取引画面を開く", path: `/transactions/${tx.id}` },
  };

  await Promise.all([
    sendMail({ userId: tx.buyerId, kind: "tx_completed", refId: tx.id, body }),
    sendMail({ userId: tx.sellerId, kind: "tx_completed", refId: tx.id, body }),
  ]);
}

/** 取引キャンセル(双方へ。通知設定では無効化できない) */
export async function notifyCanceled(transactionId: string, reason: string): Promise<void> {
  const tx = await loadTransaction(transactionId);
  if (!tx) return;

  const body = {
    intro: "運営によりこの取引がキャンセルされました。",
    details: [
      { label: "商品", value: tx.listingTitle },
      { label: "金額", value: formatPrice(tx.price) },
      { label: "理由", value: reason },
    ],
    cta: { label: "取引画面を開く", path: `/transactions/${tx.id}` },
    outro:
      "お支払い済みの場合の返金については、運営より個別にご連絡します。ご不明な点はお問い合わせください。",
  };

  await Promise.all([
    sendMail({ userId: tx.buyerId, kind: "tx_canceled", refId: tx.id, body }),
    sendMail({ userId: tx.sellerId, kind: "tx_canceled", refId: tx.id, body }),
  ]);
}

// ============================================================
// メッセージ
// ============================================================

/**
 * 新着メッセージ(受信者へ)。
 * 同一スレッドで直近 30 分以内に送信済みなら抑制する。
 */
export async function notifyNewMessage(threadId: string, senderId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: thread } = await supabase
    .from("threads")
    .select("id, buyer_id, listings!inner(id, title, seller_id)")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread?.listings) return;

  const sellerId = thread.listings.seller_id;
  const recipientId = senderId === thread.buyer_id ? sellerId : thread.buyer_id;

  const lastSentAt = await findLastSentAt(recipientId, "new_message", threadId);
  if (shouldThrottleMessageNotification(lastSentAt, new Date())) return;

  const { data: sender } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", senderId)
    .maybeSingle();

  await sendMail({
    userId: recipientId,
    kind: "new_message",
    refId: threadId,
    body: {
      intro: `${sender?.display_name ?? "取引相手"} さんからメッセージが届きました。`,
      details: [{ label: "商品", value: thread.listings.title }],
      cta: { label: "メッセージを開く", path: `/messages/${threadId}` },
      outro: "メッセージの本文は、安全のためこのメールには含めていません。",
    },
  });
}

// ============================================================
// 運営向け
// ============================================================

export type DisputeInfo = {
  /** Stripe の申し立て ID */
  disputeId: string;
  /** 対象の PaymentIntent。取引の特定に使う */
  paymentIntentId: string | null;
  amount: number;
  reason: string | null;
  /** 反論資料の提出期限(UNIX 秒) */
  evidenceDueBy: number | null;
};

/**
 * チャージバック(不正利用の申し立て)を運営へ通知する。
 *
 * Stripe には応答期限があり、過ぎると自動的に敗訴して代金が引き戻される。
 * 通知だけでも受け取れるようにして、気づかないまま期限を逃す事態を防ぐ。
 * 反論資料の提出は Stripe ダッシュボードから手作業で行う(別紙1 3.(4))。
 */
export async function notifyDispute(info: DisputeInfo): Promise<void> {
  const supabase = createAdminClient();

  // 決済 ID から該当取引を引き当てる。見つからなくても通知は送る。
  const { data: transaction } = info.paymentIntentId
    ? await supabase
        .from("transactions")
        .select("id, price, listings!inner(title)")
        .eq("stripe_payment_intent_id", info.paymentIntentId)
        .maybeSingle()
    : { data: null };

  const details = [
    { label: "申し立て ID", value: info.disputeId },
    { label: "金額", value: formatPrice(info.amount) },
    { label: "理由", value: info.reason ?? "不明" },
    {
      label: "反論期限",
      value: info.evidenceDueBy ? formatDateTime(new Date(info.evidenceDueBy * 1000)) : "不明",
    },
  ];

  if (transaction) {
    details.unshift({ label: "商品", value: transaction.listings?.title ?? "(不明)" });
  } else {
    details.push({
      label: "該当取引",
      value: `見つかりませんでした(決済ID: ${info.paymentIntentId ?? "不明"})`,
    });
  }

  const { data: admins } = await supabase
    .from("users")
    .select("id")
    .eq("role", "admin")
    .eq("status", "active");

  if (!admins || admins.length === 0) {
    console.error("[dispute] 通知先の管理者が見つかりません", info.disputeId);
    return;
  }

  await Promise.all(
    admins.map((admin) =>
      sendMail({
        userId: admin.id,
        kind: "admin_dispute",
        refId: transaction?.id,
        body: {
          intro:
            "カード会社から不正利用の申し立てがありました。期限までに Stripe ダッシュボードで対応してください。",
          details,
          cta: transaction
            ? {
                label: "取引を確認する",
                path: `/admin/transactions?q=${encodeURIComponent(transaction.listings?.title ?? "")}`,
              }
            : { label: "取引管理を開く", path: "/admin/transactions" },
          outro: "期限を過ぎると自動的に申し立てが認められ、代金が引き戻されます。",
        },
      }),
    ),
  );
}
