import { beforeEach, describe, expect, it, vi } from "vitest";
import { findStateMismatches } from "./queries";
import type { ListingStatus, TransactionStatus } from "@/lib/constants";

type Row = {
  id: string;
  listing_id: string;
  status: TransactionStatus;
  listings: { id: string; title: string; status: ListingStatus };
};
const db = vi.hoisted(() => ({ rows: [] as Row[], failActive: false, failInitial: false }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      let rows = db.rows;
      let selection = "";
      const value = (row: Row, key: string) =>
        key === "listings.status" ? row.listings.status : row[key as "status" | "listing_id"];
      const query = {
        select: (columns: string) => {
          selection = columns;
          return query;
        },
        in: (key: string, values: string[]) => {
          rows = rows.filter((row) => values.includes(value(row, key)));
          return query;
        },
        eq: (key: string, expected: string) => {
          rows = rows.filter((row) => value(row, key) === expected);
          return query;
        },
        neq: (key: string, expected: string) => {
          rows = rows.filter((row) => value(row, key) !== expected);
          return query;
        },
        limit: (count: number) => {
          rows = rows.slice(0, count);
          return query;
        },
        then: (resolve: (result: unknown) => unknown) =>
          Promise.resolve(
            resolve({
              data: rows,
              error: (selection === "listing_id" ? db.failActive : db.failInitial)
                ? { message: "database unavailable" }
                : null,
            }),
          ),
      };
      return query;
    },
  }),
}));
function add(
  id: string,
  status: TransactionStatus,
  listingStatus: ListingStatus = "trading",
  listingId = "bike",
) {
  db.rows.push({
    id,
    status,
    listing_id: listingId,
    listings: { id: listingId, title: "テスト商品", status: listingStatus },
  });
}
beforeEach(() => {
  db.rows = [];
  db.failActive = false;
  db.failInitial = false;
});

describe("findStateMismatches", () => {
  it.each(["paid", "shipped", "received"] as const)(
    "キャンセル後に再購入した商品が%sなら誤検知しない",
    async (status) => {
      add("old", "canceled");
      add("new", status);
      expect(await findStateMismatches()).toEqual([]);
    },
  );
  it("キャンセル後に取引中のまま残った商品は検出する", async () => {
    add("old", "canceled");
    expect(await findStateMismatches()).toEqual([
      expect.objectContaining({ transactionId: "old" }),
    ]);
  });
  it("次の購入が支払い待ちなら取引中を正当化しない", async () => {
    add("old", "canceled");
    add("new", "pending_payment");
    expect(await findStateMismatches()).toHaveLength(1);
  });
  it("別商品の決済済み取引で本当の不整合を隠さない", async () => {
    add("old", "canceled");
    add("other", "paid", "trading", "other-bike");
    expect(await findStateMismatches()).toEqual([
      expect.objectContaining({ transactionId: "old" }),
    ]);
  });
  it("複数のキャンセル履歴と正常な再購入があっても別商品の不整合は残す", async () => {
    add("old1", "canceled");
    add("old2", "canceled");
    add("new", "paid");
    add("broken", "canceled", "trading", "other-bike");
    expect(await findStateMismatches()).toEqual([
      expect.objectContaining({ transactionId: "broken" }),
    ]);
  });
  it("決済済みなのに公開中、および完了なのに取引中を引き続き検出する", async () => {
    add("paid", "paid", "published");
    add("done", "completed", "trading", "other-bike");
    expect((await findStateMismatches()).map((row) => row.transactionId)).toEqual(["paid", "done"]);
  });
  it("再購入が正常に完了した商品は検出しない", async () => {
    add("old", "canceled", "sold");
    add("new", "completed", "sold");
    expect(await findStateMismatches()).toEqual([]);
  });
  it("再購入の取得失敗を不整合や正常と誤報しない", async () => {
    add("old", "canceled");
    db.failActive = true;
    await expect(findStateMismatches()).rejects.toThrow("再購入後の取引状態");
  });
  it("初期取得の失敗を正常と扱わない", async () => {
    db.failInitial = true;
    await expect(findStateMismatches()).rejects.toThrow("取引と商品の状態");
  });
});
