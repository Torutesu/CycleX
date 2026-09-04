import { describe, expect, it } from "vitest";
import {
  amountMatches,
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

  it("キャンセル済みの取引に入金が届いたら、復活させずに遅延入金として記録する", () => {
    // 管理者キャンセルや掃除バッチの後に購入者が決済画面から支払ったケース
    expect(decideCompleted(TX_ID, "canceled", "paid")).toEqual({ kind: "late_payment" });
    expect(decideCompleted(TX_ID, "canceled", "paid", false)).toEqual({ kind: "late_payment" });
  });

  it("遅延入金を記録済みなら再送はスキップする", () => {
    expect(decideCompleted(TX_ID, "canceled", "paid", true).kind).toBe("skip");
  });

  it("キャンセル済みでも未入金なら何もしない", () => {
    expect(decideCompleted(TX_ID, "canceled", "unpaid").kind).toBe("skip");
  });

  it("metadata が欠けていれば復旧不能な不正として扱う(再送させない)", () => {
    for (const id of [undefined, ""]) {
      const decision = decideCompleted(id, "pending_payment", "paid");
      expect(decision.kind).toBe("invalid");
      if (decision.kind === "invalid") expect(decision.retry).toBe(false);
    }
  });

  it("取引が存在しなければ DB 障害の可能性があるので再送させる", () => {
    const decision = decideCompleted(TX_ID, null, "paid");
    expect(decision.kind).toBe("invalid");
    if (decision.kind === "invalid") {
      expect(decision.reason).toContain(TX_ID);
      expect(decision.retry).toBe(true);
    }
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
    const decision = decideExpired(null, "pending_payment");
    expect(decision.kind).toBe("invalid");
    if (decision.kind === "invalid") expect(decision.retry).toBe(false);
  });

  it("取引が見つからなければ再送させる", () => {
    const decision = decideExpired(TX_ID, null);
    expect(decision.kind).toBe("invalid");
    if (decision.kind === "invalid") expect(decision.retry).toBe(true);
  });
});

describe("amountMatches", () => {
  it("金額と通貨が一致するときだけ true", () => {
    expect(amountMatches(15000, 15000, "jpy")).toBe(true);
    expect(amountMatches(15000, 15000, "JPY")).toBe(true);
    expect(amountMatches(15000, 14000, "jpy")).toBe(false);
    expect(amountMatches(15000, 15000, "usd")).toBe(false);
    expect(amountMatches(15000, null, "jpy")).toBe(false);
    expect(amountMatches(15000, undefined, "jpy")).toBe(false);
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
