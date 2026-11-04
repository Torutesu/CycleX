import { describe, expect, it } from "vitest";
import { canReportTransaction, reportDeadline, transactionReportReasons } from "./rules";

const RECEIVED = "2026-11-01T03:00:00.000Z";
const hoursAfter = (hours: number) => new Date(new Date(RECEIVED).getTime() + hours * 3600_000);

describe("取引の問題の申告", () => {
  it("購入者は受取確認から3日以内なら申告でき、過ぎるとできない", () => {
    expect(canReportTransaction("received", "buyer", RECEIVED, hoursAfter(72))).toBe(true);
    expect(canReportTransaction("received", "buyer", RECEIVED, hoursAfter(72.01))).toBe(false);
    expect(canReportTransaction("completed", "buyer", RECEIVED, hoursAfter(1))).toBe(true);
    expect(reportDeadline(RECEIVED)?.toISOString()).toBe("2026-11-04T03:00:00.000Z");
  });

  it("受け取る前(未着など)は期限が始まっていない", () => {
    const later = hoursAfter(24 * 30);
    expect(reportDeadline(null)).toBeNull();
    expect(canReportTransaction("paid", "buyer", null, later)).toBe(true);
    expect(canReportTransaction("shipped", "buyer", null, later)).toBe(true);
  });

  it("出品者に期限は無く、支払い前の取引は誰も申告できない", () => {
    expect(canReportTransaction("completed", "seller", RECEIVED, hoursAfter(24 * 30))).toBe(true);
    expect(canReportTransaction("pending_payment", "buyer", null, hoursAfter(0))).toBe(false);
    expect(canReportTransaction("pending_payment", "seller", null, hoursAfter(0))).toBe(false);
  });

  it("双方合意のキャンセルは、発送前(支払い済み)の間だけ選べる", () => {
    const values = (status: Parameters<typeof transactionReportReasons>[0]) =>
      transactionReportReasons(status).map((option) => option.value);
    expect(values("paid")).toContain("cancel_agreed");
    for (const status of ["shipped", "received", "completed", "canceled"] as const) {
      expect(values(status)).not.toContain("cancel_agreed");
      expect(values(status)).toContain("not_received");
    }
  });
});
