import { describe, expect, it } from "vitest";
import {
  canSuspendListing,
  canSuspendUser,
  isCancellable,
  listingAfterCancel,
  SUSPENDABLE_LISTING_STATUSES,
  needsRefund,
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
