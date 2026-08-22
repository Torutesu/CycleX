import { describe, expect, it } from "vitest";
import {
  decideCompleted,
  decideExpired,
  paymentIntentIdOf,
} from "@/features/transaction/webhook-rules";

const TX_ID = "tx-123";

describe("decideCompleted", () => {
  it("未決済の取引には決済確定を適用する", () => {
    expect(decideCompleted(TX_ID, "pending_payment")).toEqual({ kind: "apply" });
  });

  it("再送イベントは冪等にスキップする", () => {
    for (const status of ["paid", "shipped", "received", "completed"] as const) {
      const decision = decideCompleted(TX_ID, status);
      expect(decision.kind).toBe("skip");
    }
  });

  it("キャンセル済みの取引は復活させない", () => {
    expect(decideCompleted(TX_ID, "canceled").kind).toBe("skip");
  });

  it("metadata が欠けていれば不正として扱う", () => {
    expect(decideCompleted(undefined, "pending_payment").kind).toBe("invalid");
    expect(decideCompleted("", "pending_payment").kind).toBe("invalid");
  });

  it("取引が存在しなければ不正として扱う", () => {
    const decision = decideCompleted(TX_ID, null);
    expect(decision.kind).toBe("invalid");
    if (decision.kind === "invalid") expect(decision.reason).toContain(TX_ID);
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
