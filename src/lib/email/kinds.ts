/**
 * FR-13 のメール種別。
 * category が null のものは通知設定で無効化できない(取引の重大な変更・認証系)。
 */

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
  | "tx_ship_reminder"
  | "tx_receive_reminder"
  | "admin_dispute"
  | "admin_late_payment";

type MailKindMeta = {
  subject: string;
  /** null なら常に送信する */
  category: NotificationCategory | null;
};

export const MAIL_KINDS: Record<MailKind, MailKindMeta> = {
  welcome: { subject: "CycleX へようこそ", category: null },
  listing_paid_seller: { subject: "商品が購入されました", category: "transaction" },
  purchase_confirmed: { subject: "ご購入ありがとうございます", category: "transaction" },
  tx_shipped: { subject: "発送・受渡のご連絡があります", category: "transaction" },
  tx_received: { subject: "受取確認のお知らせ", category: "transaction" },
  tx_completed: { subject: "取引が完了しました", category: "transaction" },
  // FR-13 では 5〜12 の通知を設定で止められる。キャンセルも「取引」カテゴリに従う
  tx_canceled: { subject: "取引がキャンセルされました", category: "transaction" },
  review_requested: { subject: "評価のお願い", category: "review" },
  review_received: { subject: "評価が届きました", category: "review" },
  new_message: { subject: "新着メッセージがあります", category: "message" },
  // 止まったままの取引の催促(FR-08 の運用補助)。取引の通知として扱う
  tx_ship_reminder: { subject: "発送・受渡のご連絡をお願いします", category: "transaction" },
  tx_receive_reminder: { subject: "商品は届きましたか?", category: "transaction" },
  // 運営あて。応答期限があるため設定に関わらず必ず送る
  admin_dispute: { subject: "【要対応】チャージバックの申し立てがありました", category: null },
  // 運営あて。キャンセル済みの取引に支払いが届いたので返金が必要
  admin_late_payment: { subject: "【要対応】キャンセル済み取引に入金がありました", category: null },
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

/** 止まった取引の催促を送る間隔(日)。同じ取引に毎日は送らない */
export const REMINDER_INTERVAL_DAYS = 7;

/** 直近の送信ログから、催促を送ってよいか判定する(純関数) */
export function shouldSendReminder(
  lastSentAt: string | null,
  now: Date,
  intervalDays = REMINDER_INTERVAL_DAYS,
): boolean {
  if (!lastSentAt) return true;
  const elapsedMs = now.getTime() - new Date(lastSentAt).getTime();
  return elapsedMs >= intervalDays * 24 * 60 * 60 * 1000;
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
