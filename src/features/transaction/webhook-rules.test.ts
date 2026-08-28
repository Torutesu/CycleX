import { describe, expect, it } from "vitest";
import {
  decideCompleted,
  decideExpired,
  paymentIntentIdOf,
} from "@/features/transaction/webhook-rules";

const TX_ID = "tx-123";

describe("decideCompleted", () => {
  it("入金確定済みの未決済取引には決済確定を適用する", () => {
    expect(decideCompleted(TX_ID, "pending_payment", "paid")).toEqual({ kind: "apply" });
  });

  it("入金が未確定なら取引を成立させず保留する", () => {
    // コンビニ払い・銀行振込では completed が unpaid のまま飛んでくる
    for (const paymentStatus of ["unpaid", "no_payment_required", null, undefined] as const) {
      const decision = decideCompleted(TX_ID, "pending_payment", paymentStatus);
      expect(decision.kind).toBe("defer");
    }
  });

  it("再送イベントは冪等にスキップする", () => {
    for (const status of ["paid", "shipped", "received", "completed"] as const) {
      const decision = decideCompleted(TX_ID, status, "paid");
      expect(decision.kind).toBe("skip");
    }
  });

  it("キャンセル済みの取引は復活させない", () => {
    expect(decideCompleted(TX_ID, "canceled", "paid").kind).toBe("skip");
  });

  it("metadata が欠けていれば不正として扱う", () => {
    expect(decideCompleted(undefined, "pending_payment", "paid").kind).toBe("invalid");
    expect(decideCompleted("", "pending_payment", "paid").kind).toBe("invalid");
  });

  it("取引が存在しなければ不正として扱う", () => {
    const decision = decideCompleted(TX_ID, null, "paid");
    expect(decision.kind).toBe("invalid");
    if (decision.kind === "invalid") expect(decision.reason).toContain(TX_ID);
  });

  it("状態の判定は入金状態より先に行う(未知の取引を保留にしない)", () => {
    expect(decideCompleted(TX_ID, null, "unpaid").kind).toBe("invalid");
    expect(decideCompleted(TX_ID, "paid", "unpaid").kind).toBe("skip");
  });
});

describe("decideExpired", () => {
  it("未決済のまま期限切れならキャンセルする", () => {
    expect(decideExpired(TX_ID, "pending_payment")).toEqual({ kind: "apply" });
  });

  it("先に決済が確定していれば期限切れは無視する", () => {
    expect(decideExpired(TX_ID, "paid").kind).toBe("skip");
  });

  it("すでにキャンセル済みなら何もしない", () => {
    expect(decideExpired(TX_ID, "canceled").kind).toBe("skip");
  });

  it("metadata が欠けていれば不正として扱う", () => {
    expect(decideExpired(null, "pending_payment").kind).toBe("invalid");
  });
});

describe("paymentIntentIdOf", () => {
  it("文字列・オブジェクト・null を扱える", () => {
    expect(paymentIntentIdOf("pi_123")).toBe("pi_123");
    expect(paymentIntentIdOf({ id: "pi_456" })).toBe("pi_456");
    expect(paymentIntentIdOf(null)).toBeNull();
    expect(paymentIntentIdOf(undefined)).toBeNull();
  });
});
