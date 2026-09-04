import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { findLastSentAt } from "@/lib/email/send";
import { shouldSendReminder } from "@/lib/email/kinds";
import { notifyReceiveReminder, notifyShipReminder } from "@/features/notification/notify";

/** 支払い後、この日数を過ぎても発送連絡が無ければ出品者に催促する */
export const SHIP_REMINDER_DAYS = 7;
/** 発送連絡後、この日数を過ぎても受取確認が無ければ購入者に催促する */
export const RECEIVE_REMINDER_DAYS = 14;

export type ReminderResult = { ship: number; receive: number };

/**
 * 止まったままの取引を当事者へ催促する(日次)。
 *
 * 取引が進まないまま放置されると、購入者は代金だけ払った状態、出品者は
 * 売上も評価も得られない状態が続く。運営が個別に連絡する前に、まず本人へ促す。
 * 同じ取引へ毎日送らないよう、送信間隔は email_logs で抑制する。
 */
export async function sendStalledTransactionReminders(now = new Date()): Promise<ReminderResult> {
  const supabase = createAdminClient();
  const result: ReminderResult = { ship: 0, receive: 0 };

  const shipThreshold = new Date(
    now.getTime() - SHIP_REMINDER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const receiveThreshold = new Date(
    now.getTime() - RECEIVE_REMINDER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [{ data: unshipped }, { data: unreceived }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, seller_id")
      .eq("status", "paid")
      .not("paid_at", "is", null)
      .lte("paid_at", shipThreshold),
    supabase
      .from("transactions")
      .select("id, buyer_id")
      .eq("status", "shipped")
      .not("shipped_at", "is", null)
      .lte("shipped_at", receiveThreshold),
  ]);

  for (const transaction of unshipped ?? []) {
    const lastSentAt = await findLastSentAt(
      transaction.seller_id,
      "tx_ship_reminder",
      transaction.id,
    );
    if (!shouldSendReminder(lastSentAt, now)) continue;
    await notifyShipReminder(transaction.id, SHIP_REMINDER_DAYS);
    result.ship += 1;
  }

  for (const transaction of unreceived ?? []) {
    const lastSentAt = await findLastSentAt(
      transaction.buyer_id,
      "tx_receive_reminder",
      transaction.id,
    );
    if (!shouldSendReminder(lastSentAt, now)) continue;
    await notifyReceiveReminder(transaction.id, RECEIVE_REMINDER_DAYS);
    result.receive += 1;
  }

  return result;
}
