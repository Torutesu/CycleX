import { describe, expect, it } from "vitest";
import {
  MAIL_KINDS,
  shouldSend,
  shouldThrottleMessageNotification,
  type MailKind,
} from "@/lib/email/kinds";

const NOW = new Date("2026-08-22T12:00:00Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();
}

describe("shouldSend", () => {
  it("設定が未指定なら既定で送信する", () => {
    expect(shouldSend("tx_shipped", {}, "active")).toBe(true);
    expect(shouldSend("new_message", null, "active")).toBe(true);
  });

  it("カテゴリを OFF にすると送らない", () => {
    expect(shouldSend("tx_shipped", { transaction: false }, "active")).toBe(false);
    expect(shouldSend("new_message", { message: false }, "active")).toBe(false);
    expect(shouldSend("review_requested", { review: false }, "active")).toBe(false);
  });

  it("別カテゴリの OFF は影響しない", () => {
    expect(shouldSend("tx_shipped", { message: false }, "active")).toBe(true);
  });

  it("キャンセル通知は設定で止められない", () => {
    expect(shouldSend("tx_canceled", { transaction: false }, "active")).toBe(true);
  });

  it("ウェルカムメールは設定の対象外", () => {
    expect(shouldSend("welcome", { transaction: false, message: false }, "active")).toBe(true);
  });

  it("退会・利用停止のユーザーには送らない", () => {
    expect(shouldSend("tx_canceled", {}, "withdrawn")).toBe(false);
    expect(shouldSend("tx_canceled", {}, "suspended")).toBe(false);
    expect(shouldSend("welcome", {}, "withdrawn")).toBe(false);
  });
});

describe("MAIL_KINDS", () => {
  it("FR-13 の全種別に件名がある", () => {
    const kinds: MailKind[] = [
      "welcome",
      "listing_paid_seller",
      "purchase_confirmed",
      "tx_shipped",
      "tx_received",
      "tx_completed",
      "tx_canceled",
      "review_requested",
      "review_received",
      "new_message",
    ];
    for (const kind of kinds) {
      expect(MAIL_KINDS[kind].subject.length).toBeGreaterThan(0);
    }
  });

  it("設定で止められないのはキャンセルとウェルカムのみ", () => {
    const alwaysSend = (Object.keys(MAIL_KINDS) as MailKind[]).filter(
      (kind) => MAIL_KINDS[kind].category === null,
    );
    expect(alwaysSend.sort()).toEqual(["tx_canceled", "welcome"]);
  });
});

describe("shouldThrottleMessageNotification", () => {
  it("未送信なら抑制しない", () => {
    expect(shouldThrottleMessageNotification(null, NOW)).toBe(false);
  });

  it("30分以内の再送は抑制する", () => {
    expect(shouldThrottleMessageNotification(minutesAgo(1), NOW)).toBe(true);
    expect(shouldThrottleMessageNotification(minutesAgo(29), NOW)).toBe(true);
  });

  it("30分を過ぎたら再通知する", () => {
    expect(shouldThrottleMessageNotification(minutesAgo(30), NOW)).toBe(false);
    expect(shouldThrottleMessageNotification(minutesAgo(60), NOW)).toBe(false);
  });
});
