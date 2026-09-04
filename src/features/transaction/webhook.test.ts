import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Webhook 処理の副作用を、Supabase と Stripe を差し替えて検証する。
 * A-1(キャンセル後の入金)と A-2(DB 障害の再送)を固定するのが目的。
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  transactions: new Map<string, Row>(),
  events: [] as Row[],
  updates: [] as { table: string; patch: Row; filters: Record<string, unknown> }[],
  selectError: null as { message: string } | null,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => {
  function table(name: string) {
    const filters: Record<string, unknown> = {};
    let patch: Row | null = null;
    let inserted: Row | null = null;
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      },
      lt: () => builder,
      update: (p: Row) => {
        patch = p;
        return builder;
      },
      insert: (row: Row) => {
        inserted = row;
        return builder;
      },
      maybeSingle: async () => {
        if (state.selectError) return { data: null, error: state.selectError };
        if (name !== "transactions") return { data: null, error: null };
        const row = state.transactions.get(String(filters.id));
        if (patch) {
          if (!row || (filters.status && row.status !== filters.status)) {
            return { data: null, error: null };
          }
          Object.assign(row, patch);
          state.updates.push({ table: name, patch, filters });
          return { data: row, error: null };
        }
        return { data: row ?? null, error: null };
      },
      then: (resolve: (v: unknown) => void) => {
        // await builder(update/insert without select)
        if (inserted) {
          state.events.push(inserted);
          return resolve({ data: null, error: null });
        }
        if (patch) {
          const row = state.transactions.get(String(filters.id));
          if (row && (!filters.status || row.status === filters.status)) {
            Object.assign(row, patch);
            state.updates.push({ table: name, patch, filters });
          }
          return resolve({ data: null, error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return builder;
  }
  return { createAdminClient: () => ({ from: table }) };
});

const notify = vi.hoisted(() => ({
  notifyPaid: vi.fn(async () => {}),
  notifyLatePayment: vi.fn(async () => {}),
  notifyDispute: vi.fn(async () => {}),
}));
vi.mock("@/features/notification/notify", () => notify);

const stripeMock = vi.hoisted(() => ({
  expire: vi.fn(),
  retrieve: vi.fn(),
}));
// stripe パッケージ自体を差し替え、lib/stripe.ts の失効ロジックは本物を通す
vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = { sessions: { expire: stripeMock.expire, retrieve: stripeMock.retrieve } };
  },
}));
process.env.STRIPE_SECRET_KEY = "sk_test_mock";

import { handleCheckoutCompleted } from "./webhook";
import { cancelPendingTransaction } from "./cancel";
import { getTransaction } from "./service";

function seed(id: string, status: string, extra: Row = {}) {
  state.transactions.set(id, {
    id,
    listing_id: "listing-1",
    seller_id: "seller",
    buyer_id: "buyer",
    status,
    price: 15000,
    shipping_note: null,
    stripe_session_id: "cs_test_1",
    stripe_payment_intent_id: null,
    paid_at: null,
    shipped_at: null,
    received_at: null,
    completed_at: null,
    canceled_at: null,
    canceled_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    ...extra,
  });
}

beforeEach(() => {
  state.transactions.clear();
  state.events.length = 0;
  state.updates.length = 0;
  state.selectError = null;
  vi.clearAllMocks();
});

describe("handleCheckoutCompleted", () => {
  it("未決済の取引に paid が届いたら決済確定する", async () => {
    seed("tx-1", "pending_payment");
    const outcome = await handleCheckoutCompleted({
      id: "cs_test_1",
      metadata: { transaction_id: "tx-1" },
      payment_intent: "pi_1",
      payment_status: "paid",
      amount_total: 15000,
      currency: "jpy",
    });
    expect(outcome).toEqual({ handled: true, action: "paid" });
    expect(state.transactions.get("tx-1")?.status).toBe("paid");
    expect(state.transactions.get("tx-1")?.stripe_payment_intent_id).toBe("pi_1");
    expect(notify.notifyPaid).toHaveBeenCalledWith("tx-1");
  });

  it("キャンセル済みの取引に入金が届いたら、復活させずに支払いを記録して運営へ知らせる", async () => {
    seed("tx-2", "canceled", { canceled_at: "2026-01-01T01:00:00Z" });
    const outcome = await handleCheckoutCompleted({
      id: "cs_test_2",
      metadata: { transaction_id: "tx-2" },
      payment_intent: "pi_2",
      payment_status: "paid",
    });
    expect(outcome).toEqual({ handled: true, action: "late_payment_recorded" });
    const row = state.transactions.get("tx-2")!;
    expect(row.status).toBe("canceled");
    expect(row.paid_at).toBeTruthy();
    expect(row.stripe_payment_intent_id).toBe("pi_2");
    expect(state.events.some((e) => e.event === "payment_after_cancel")).toBe(true);
    expect(notify.notifyLatePayment).toHaveBeenCalledWith("tx-2");
    expect(notify.notifyPaid).not.toHaveBeenCalled();
  });

  it("遅延入金を記録済みなら再送で二重に記録しない", async () => {
    seed("tx-3", "canceled", { paid_at: "2026-01-01T02:00:00Z" });
    const outcome = await handleCheckoutCompleted({
      id: "cs_test_3",
      metadata: { transaction_id: "tx-3" },
      payment_intent: "pi_3",
      payment_status: "paid",
    });
    expect(outcome).toEqual({ handled: true, action: "already_processed" });
    expect(notify.notifyLatePayment).not.toHaveBeenCalled();
  });

  it("DB の一時障害は例外として伝え、200 で握りつぶさない", async () => {
    seed("tx-4", "pending_payment");
    state.selectError = { message: "connection reset" };
    await expect(
      handleCheckoutCompleted({
        id: "cs_test_4",
        metadata: { transaction_id: "tx-4" },
        payment_intent: "pi_4",
        payment_status: "paid",
      }),
    ).rejects.toThrow(/取引の取得に失敗/);
  });

  it("取引が存在しなければ再送を要求する", async () => {
    const outcome = await handleCheckoutCompleted({
      id: "cs_test_5",
      metadata: { transaction_id: "tx-missing" },
      payment_intent: "pi_5",
      payment_status: "paid",
    });
    expect(outcome).toEqual({
      handled: false,
      reason: expect.stringContaining("tx-missing"),
      retry: true,
    });
  });

  it("metadata が無ければ再送を要求しない", async () => {
    const outcome = await handleCheckoutCompleted({
      id: "cs_test_6",
      metadata: {},
      payment_intent: null,
      payment_status: "paid",
    });
    expect(outcome).toMatchObject({ handled: false, retry: false });
  });
});

describe("cancelPendingTransaction", () => {
  it("キャンセルの前に Stripe のセッションを失効させる", async () => {
    seed("tx-10", "pending_payment");
    stripeMock.expire.mockResolvedValue({});
    const tx = (await getTransaction("tx-10"))!;
    const result = await cancelPendingTransaction(tx, "admin", { reason: "運営判断" });
    expect(stripeMock.expire).toHaveBeenCalledWith("cs_test_1");
    expect(result.outcome).toBe("canceled");
    expect(state.transactions.get("tx-10")?.status).toBe("canceled");
    expect(state.transactions.get("tx-10")?.canceled_reason).toBe("運営判断");
  });

  it("失効しようとして支払い済みと分かったらキャンセルせず paid にする", async () => {
    seed("tx-11", "pending_payment");
    stripeMock.expire.mockRejectedValue(new Error("not open"));
    stripeMock.retrieve.mockResolvedValue({ payment_status: "paid", payment_intent: "pi_11" });
    const tx = (await getTransaction("tx-11"))!;
    const result = await cancelPendingTransaction(tx, "admin", { reason: "運営判断" });
    expect(result.outcome).toBe("paid");
    expect(state.transactions.get("tx-11")?.status).toBe("paid");
    expect(state.transactions.get("tx-11")?.stripe_payment_intent_id).toBe("pi_11");
    expect(notify.notifyPaid).toHaveBeenCalledWith("tx-11");
  });

  it("Stripe の状態が確認できなければキャンセルを見送る", async () => {
    seed("tx-12", "pending_payment");
    stripeMock.expire.mockRejectedValue(new Error("network"));
    stripeMock.retrieve.mockRejectedValue(new Error("network"));
    const tx = (await getTransaction("tx-12"))!;
    await expect(
      cancelPendingTransaction(tx, "system", { reason: "payment_timeout" }),
    ).rejects.toThrow();
    expect(state.transactions.get("tx-12")?.status).toBe("pending_payment");
  });

  it("デモ決済の擬似セッションでは Stripe を呼ばない", async () => {
    seed("tx-13", "pending_payment", { stripe_session_id: "demo_tx-13" });
    const tx = (await getTransaction("tx-13"))!;
    const result = await cancelPendingTransaction(tx, "system", { reason: "payment_expired" });
    expect(stripeMock.expire).not.toHaveBeenCalled();
    expect(result.outcome).toBe("canceled");
  });
});
