import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  canTransition,
  isActiveTransaction,
  describeCancelReason,
  listingStatusFor,
  nextActionFor,
  timestampColumnFor,
  type TxRole,
} from "@/features/transaction/state";
import type { TransactionStatus } from "@/lib/constants";

const ALL_STATUSES: TransactionStatus[] = [
  "pending_payment",
  "paid",
  "shipped",
  "received",
  "completed",
  "canceled",
];
const ALL_ROLES: TxRole[] = ["buyer", "seller", "admin", "system"];

describe("canTransition — 許可される遷移", () => {
  it("決済確定は system(Webhook)のみ", () => {
    expect(canTransition("pending_payment", "paid", "system")).toBe(true);
    expect(canTransition("pending_payment", "paid", "buyer")).toBe(false);
    expect(canTransition("pending_payment", "paid", "seller")).toBe(false);
    expect(canTransition("pending_payment", "paid", "admin")).toBe(false);
  });

  it("発送連絡は出品者のみ", () => {
    expect(canTransition("paid", "shipped", "seller")).toBe(true);
    expect(canTransition("paid", "shipped", "buyer")).toBe(false);
    expect(canTransition("paid", "shipped", "admin")).toBe(false);
  });

  it("受取確認は購入者のみ", () => {
    expect(canTransition("shipped", "received", "buyer")).toBe(true);
    expect(canTransition("shipped", "received", "seller")).toBe(false);
  });

  it("取引完了は system のみ(評価の完了を受けて遷移する)", () => {
    expect(canTransition("received", "completed", "system")).toBe(true);
    expect(canTransition("received", "completed", "buyer")).toBe(false);
    expect(canTransition("received", "completed", "seller")).toBe(false);
  });

  it("キャンセルは管理者(未決済のみ system も可)", () => {
    expect(canTransition("pending_payment", "canceled", "system")).toBe(true);
    expect(canTransition("pending_payment", "canceled", "admin")).toBe(true);
    expect(canTransition("paid", "canceled", "admin")).toBe(true);
    expect(canTransition("shipped", "canceled", "admin")).toBe(true);
    expect(canTransition("received", "canceled", "admin")).toBe(true);
    // 当事者は自分でキャンセルできない(FR-08)
    expect(canTransition("paid", "canceled", "buyer")).toBe(false);
    expect(canTransition("paid", "canceled", "seller")).toBe(false);
  });
});

describe("canTransition — 禁止される遷移", () => {
  it("終端ステータスからは遷移できない", () => {
    for (const to of ALL_STATUSES) {
      for (const role of ALL_ROLES) {
        expect(canTransition("completed", to, role)).toBe(false);
        expect(canTransition("canceled", to, role)).toBe(false);
      }
    }
  });

  it("ステップを飛ばせない", () => {
    for (const role of ALL_ROLES) {
      expect(canTransition("pending_payment", "shipped", role)).toBe(false);
      expect(canTransition("pending_payment", "received", role)).toBe(false);
      expect(canTransition("paid", "received", role)).toBe(false);
      expect(canTransition("paid", "completed", role)).toBe(false);
      expect(canTransition("shipped", "completed", role)).toBe(false);
    }
  });

  it("巻き戻せない", () => {
    for (const role of ALL_ROLES) {
      expect(canTransition("paid", "pending_payment", role)).toBe(false);
      expect(canTransition("shipped", "paid", role)).toBe(false);
      expect(canTransition("received", "shipped", role)).toBe(false);
    }
  });

  it("同じステータスへは遷移できない", () => {
    for (const status of ALL_STATUSES) {
      for (const role of ALL_ROLES) {
        expect(canTransition(status, status, role)).toBe(false);
      }
    }
  });
});

describe("allowedTransitions", () => {
  it("管理者は各段階でキャンセルでき、止まった取引を代理で進められる", () => {
    expect(allowedTransitions("pending_payment", "admin")).toEqual(["canceled"]);
    expect(allowedTransitions("paid", "admin")).toEqual(["canceled"]);
    // 受取確認をしない購入者・評価が揃わない取引は運営が代理で進める(C-3)
    expect(allowedTransitions("shipped", "admin")).toEqual(["received", "canceled"]);
    expect(allowedTransitions("received", "admin")).toEqual(["completed", "canceled"]);
    expect(allowedTransitions("completed", "admin")).toEqual([]);
    expect(allowedTransitions("canceled", "admin")).toEqual([]);
  });

  it("出品者は支払い済みの取引を発送済みにできる", () => {
    expect(allowedTransitions("paid", "seller")).toEqual(["shipped"]);
  });
});

describe("nextActionFor", () => {
  it("支払い待ちでは購入者が支払う", () => {
    expect(nextActionFor("pending_payment", "buyer")).toBe("pay");
    expect(nextActionFor("pending_payment", "seller")).toBe("wait");
  });

  it("支払い済みでは出品者が発送する", () => {
    expect(nextActionFor("paid", "seller")).toBe("ship");
    expect(nextActionFor("paid", "buyer")).toBe("wait");
  });

  it("発送済みでは購入者が受取確認する", () => {
    expect(nextActionFor("shipped", "buyer")).toBe("receive");
    expect(nextActionFor("shipped", "seller")).toBe("wait");
  });

  it("受取確認後は双方が評価する", () => {
    expect(nextActionFor("received", "buyer")).toBe("review");
    expect(nextActionFor("received", "seller")).toBe("review");
  });

  it("評価済みなら相手待ちになる", () => {
    expect(nextActionFor("received", "buyer", true)).toBe("wait");
    expect(nextActionFor("received", "seller", true)).toBe("wait");
  });

  it("終端では操作不要", () => {
    expect(nextActionFor("completed", "buyer")).toBeNull();
    expect(nextActionFor("canceled", "seller")).toBeNull();
  });
});

describe("listingStatusFor", () => {
  it("支払い完了で商品を取引中にする", () => {
    expect(listingStatusFor("paid", "published")).toBe("trading");
  });

  it("運営が非表示にした商品は支払いが来ても上書きしない", () => {
    expect(listingStatusFor("paid", "suspended")).toBeNull();
  });

  it("取引完了で売却済にする", () => {
    expect(listingStatusFor("completed", "trading")).toBe("sold");
  });

  it("キャンセル時、取引中だった商品のみ販売中へ戻す", () => {
    expect(listingStatusFor("canceled", "trading")).toBe("published");
    expect(listingStatusFor("canceled", "sold")).toBeNull();
    expect(listingStatusFor("canceled", "suspended")).toBeNull();
    expect(listingStatusFor("canceled", "published")).toBeNull();
  });

  it("発送・受取では商品の状態を変えない", () => {
    expect(listingStatusFor("shipped", "trading")).toBeNull();
    expect(listingStatusFor("received", "trading")).toBeNull();
  });
});

describe("timestampColumnFor", () => {
  it("各ステータスに対応する打刻カラムを返す", () => {
    expect(timestampColumnFor("paid")).toBe("paid_at");
    expect(timestampColumnFor("shipped")).toBe("shipped_at");
    expect(timestampColumnFor("received")).toBe("received_at");
    expect(timestampColumnFor("completed")).toBe("completed_at");
    expect(timestampColumnFor("canceled")).toBe("canceled_at");
    expect(timestampColumnFor("pending_payment")).toBeNull();
  });
});

describe("isActiveTransaction", () => {
  it("完了・キャンセル以外は進行中として扱う(退会不可・排他の対象)", () => {
    expect(ALL_STATUSES.filter(isActiveTransaction)).toEqual([
      "pending_payment",
      "paid",
      "shipped",
      "received",
    ]);
  });
});

describe("describeCancelReason", () => {
  it("内部コードは日本語に、自由文はそのまま", () => {
    expect(describeCancelReason("payment_timeout")).toBe("未決済のまま期限を超過しました");
    expect(describeCancelReason("運営判断により")).toBe("運営判断により");
    expect(describeCancelReason(null)).toBeNull();
  });
});
