import { describe, expect, it } from "vitest";
import {
  canGrantAdmin,
  canRevokeAdmin,
  canSuspendListing,
  canSuspendUser,
  isCancellable,
  listingAfterCancel,
  SUSPENDABLE_LISTING_STATUSES,
  needsRefund,
  canSuspendUserWithTransactions,
  detectStateMismatch,
} from "@/features/admin/rules";
import type { ListingStatus, TransactionStatus } from "@/lib/constants";

const ADMIN = "admin-id";
const TARGET = "target-id";

describe("canSuspendUser", () => {
  it("通常の利用者は停止できる", () => {
    expect(canSuspendUser(TARGET, ADMIN, "user", "active").allowed).toBe(true);
  });

  it("自分自身は停止できない", () => {
    const result = canSuspendUser(ADMIN, ADMIN, "user", "active");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("自分自身");
  });

  it("管理者は停止できない", () => {
    const result = canSuspendUser(TARGET, ADMIN, "admin", "active");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("管理者");
  });

  it("退会済み・停止中は対象外", () => {
    expect(canSuspendUser(TARGET, ADMIN, "user", "withdrawn").allowed).toBe(false);
    expect(canSuspendUser(TARGET, ADMIN, "user", "suspended").allowed).toBe(false);
  });
});

describe("canSuspendListing", () => {
  it("下書き・公開中・取下げは非表示にできる", () => {
    const statuses: ListingStatus[] = ["draft", "published", "withdrawn"];
    for (const status of statuses) {
      expect(canSuspendListing(status).allowed).toBe(true);
    }
  });

  it("取引中・売却済は非表示にできない", () => {
    for (const status of ["trading", "sold"] as ListingStatus[]) {
      const result = canSuspendListing(status);
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.reason).toContain("取引をキャンセル");
    }
  });

  it("すでに非表示なら操作しない", () => {
    expect(canSuspendListing("suspended").allowed).toBe(false);
  });
});

describe("SUSPENDABLE_LISTING_STATUSES", () => {
  it("利用停止の連動対象に取引中・売却済を含めない", () => {
    expect(SUSPENDABLE_LISTING_STATUSES).not.toContain("trading");
    expect(SUSPENDABLE_LISTING_STATUSES).not.toContain("sold");
  });
});

describe("listingAfterCancel", () => {
  it("取引中の商品だけ販売中へ戻す", () => {
    expect(listingAfterCancel("trading")).toBe("published");
    expect(listingAfterCancel("sold")).toBeNull();
    expect(listingAfterCancel("suspended")).toBeNull();
    expect(listingAfterCancel("published")).toBeNull();
  });
});

describe("isCancellable", () => {
  it("完了・キャンセル以外はキャンセルできる", () => {
    const statuses: TransactionStatus[] = [
      "pending_payment",
      "paid",
      "shipped",
      "received",
      "completed",
      "canceled",
    ];
    expect(statuses.filter(isCancellable)).toEqual([
      "pending_payment",
      "paid",
      "shipped",
      "received",
    ]);
  });
});

describe("needsRefund", () => {
  it("入金済みのままキャンセルされた取引を返金対象とする", () => {
    expect(needsRefund("canceled", "2026-08-01T00:00:00Z")).toBe(true);
  });

  it("未入金でキャンセルされた取引は返金対象にしない", () => {
    expect(needsRefund("canceled", null)).toBe(false);
    expect(needsRefund("canceled", undefined)).toBe(false);
  });

  it("キャンセルされていない取引は返金対象にしない", () => {
    for (const status of ["pending_payment", "paid", "shipped", "received", "completed"] as const) {
      expect(needsRefund(status, "2026-08-01T00:00:00Z")).toBe(false);
    }
  });
});

describe("canSuspendUserWithTransactions", () => {
  it("進行中の取引が無ければ停止できる", () => {
    expect(canSuspendUserWithTransactions(0).allowed).toBe(true);
  });

  it("進行中の取引があれば停止させず、件数と代替手段を伝える", () => {
    const check = canSuspendUserWithTransactions(2);
    expect(check.allowed).toBe(false);
    if (!check.allowed) {
      expect(check.reason).toContain("2件");
      expect(check.reason).toContain("非表示");
    }
  });
});

describe("detectStateMismatch", () => {
  it("整合している組み合わせは検出しない", () => {
    expect(detectStateMismatch("paid", "trading")).toBeNull();
    expect(detectStateMismatch("shipped", "trading")).toBeNull();
    expect(detectStateMismatch("completed", "sold")).toBeNull();
  });

  it("決済済みなのに商品が公開中のままなら検出する", () => {
    expect(detectStateMismatch("paid", "published")).toContain("trading");
  });

  it("完了した取引の商品が売却済でなければ検出する", () => {
    expect(detectStateMismatch("completed", "trading")).toContain("sold");
  });

  it("キャンセル済みの取引の商品が取引中のままなら検出する", () => {
    expect(detectStateMismatch("canceled", "trading")).toContain("published");
  });

  it("キャンセル済みでも商品が売却済・非表示ならそのままでよい", () => {
    expect(detectStateMismatch("canceled", "sold")).toBeNull();
    expect(detectStateMismatch("canceled", "suspended")).toBeNull();
  });

  it("支払い待ちの段階では商品の状態を問わない", () => {
    expect(detectStateMismatch("pending_payment", "published")).toBeNull();
  });
});

describe("canGrantAdmin", () => {
  it("利用中の一般会員を管理者にできる", () => {
    expect(canGrantAdmin(TARGET, ADMIN, "user", "active")).toEqual({ allowed: true });
  });

  it("自分自身のロールは変更できない", () => {
    expect(canGrantAdmin(ADMIN, ADMIN, "user", "active")).toEqual({
      allowed: false,
      reason: "自分自身のロールは変更できません。",
    });
  });

  it("すでに管理者なら何もしない", () => {
    expect(canGrantAdmin(TARGET, ADMIN, "admin", "active").allowed).toBe(false);
  });

  it("停止中・退会済みは管理者にできない", () => {
    // 入れない管理者を増やしても意味がない
    expect(canGrantAdmin(TARGET, ADMIN, "user", "suspended").allowed).toBe(false);
    expect(canGrantAdmin(TARGET, ADMIN, "user", "withdrawn").allowed).toBe(false);
  });
});

describe("canRevokeAdmin", () => {
  it("他に利用中の管理者がいれば降格できる", () => {
    expect(canRevokeAdmin(TARGET, ADMIN, "admin", 1)).toEqual({ allowed: true });
  });

  it("自分自身のロールは変更できない", () => {
    expect(canRevokeAdmin(ADMIN, ADMIN, "admin", 5).allowed).toBe(false);
  });

  it("管理者でなければ降格できない", () => {
    expect(canRevokeAdmin(TARGET, ADMIN, "user", 5).allowed).toBe(false);
  });

  it("最後の管理者は降格できない", () => {
    // 降格すると誰も管理画面に入れず、復旧に SQL が必要になる
    expect(canRevokeAdmin(TARGET, ADMIN, "admin", 0)).toEqual({
      allowed: false,
      reason: "管理者が 1 人もいなくなるため降格できません。",
    });
  });
});
