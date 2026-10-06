/**
 * FR-13 のメール種別。
 * category が null のものは通知設定で無効化できない(取引の重大な変更・認証系)。
 */

import { SITE_NAME } from "@/lib/constants";

export type NotificationCategory = "transaction" | "message" | "review";

export type MailKind =
  | "welcome"
  | "listing_paid_seller"
  | "purchase_confirmed"
  | "tx_shipped"
  | "tx_received"
  | "tx_completed"
  | "tx_canceled"
  | "review_requested"
  | "review_received"
  | "new_message"
  | "admin_dispute";

type MailKindMeta = {
  subject: string;
  /** null なら常に送信する */
  category: NotificationCategory | null;
};

export const MAIL_KINDS: Record<MailKind, MailKindMeta> = {
  welcome: { subject: `【${SITE_NAME}】会員登録が完了しました`, category: null },
  listing_paid_seller: {
    subject: `【${SITE_NAME}】商品が購入されました（お支払い確認済み）`,
    category: "transaction",
  },
  purchase_confirmed: {
    subject: `【${SITE_NAME}】お支払いが完了しました`,
    category: "transaction",
  },
  tx_shipped: { subject: `【${SITE_NAME}】発送・お受け渡しのご案内`, category: "transaction" },
  tx_received: {
    subject: `【${SITE_NAME}】商品の受け取りが確認されました`,
    category: "transaction",
  },
  tx_completed: { subject: `【${SITE_NAME}】取引が完了しました`, category: "transaction" },
  // トラブル対応に関わるため、設定に関わらず必ず送る
  tx_canceled: { subject: `【${SITE_NAME}】取引がキャンセルされました`, category: null },
  review_requested: { subject: `【${SITE_NAME}】取引相手の評価をお願いします`, category: "review" },
  review_received: {
    subject: `【${SITE_NAME}】取引相手からの評価が公開されました`,
    category: "review",
  },
  new_message: { subject: `【${SITE_NAME}】新しいメッセージが届きました`, category: "message" },
  // 運営あて。応答期限があるため設定に関わらず必ず送る
  admin_dispute: {
    subject: `【${SITE_NAME}・要対応】チャージバックの申し立てがありました`,
    category: null,
  },
};

/**
 * 通知設定を踏まえて送信すべきか判定する(純関数)。
 * 設定に該当キーが無い場合は既定で ON。
 */
export function shouldSend(
  kind: MailKind,
  prefs: Record<string, unknown> | null | undefined,
  recipientStatus: "active" | "suspended" | "withdrawn",
): boolean {
  // 退会・利用停止のユーザーには送らない
  if (recipientStatus !== "active") return false;

  const category = MAIL_KINDS[kind].category;
  if (category === null) return true;

  return prefs?.[category] !== false;
}

/** 同一スレッドの新着通知を抑制する時間(分) */
export const MESSAGE_NOTIFY_COOLDOWN_MINUTES = 30;

/** 直近の送信ログから、再通知を抑制すべきか判定する(純関数) */
export function shouldThrottleMessageNotification(
  lastSentAt: string | null,
  now: Date,
  cooldownMinutes = MESSAGE_NOTIFY_COOLDOWN_MINUTES,
): boolean {
  if (!lastSentAt) return false;
  const elapsedMs = now.getTime() - new Date(lastSentAt).getTime();
  return elapsedMs < cooldownMinutes * 60 * 1000;
}
