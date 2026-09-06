import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import { adminDb, ensureUser } from "./helpers";

/**
 * Stripe Webhook(FR-09)。
 *
 * 入金の確定はこの経路だけが行う。本物の決済は鍵が無いと試せないが、
 * 署名の検証からイベントの振り分け、状態遷移、通知までは本番と同じコードなので、
 * 正しい署名を自分で作って通しで確かめる。
 *
 * 署名鍵(STRIPE_WEBHOOK_SECRET)が無い環境では実行しない。
 */

const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const ENDPOINT = "/api/webhooks/stripe";
const STAMP = Date.now();

const SELLER = "hook-seller@example.com";
const BUYER = "hook-buyer@example.com";

let sellerId = "";
let buyerId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.skip(!SECRET, "STRIPE_WEBHOOK_SECRET が設定されていない");
  sellerId = await ensureUser(SELLER, "Webhook確認 出品者");
  buyerId = await ensureUser(BUYER, "Webhook確認 購入者");
});

test.afterAll(async () => {
  const db = adminDb();
  const { data } = await db.from("listings").select("id").like("title", `%${STAMP}%`);
  const ids = (data ?? []).map((row) => row.id);
  if (ids.length === 0) return;
  const { data: txs } = await db.from("transactions").select("id").in("listing_id", ids);
  const txIds = (txs ?? []).map((row) => row.id);
  if (txIds.length > 0) {
    await db.from("transaction_events").delete().in("transaction_id", txIds);
    await db.from("email_logs").delete().in("ref_id", txIds);
  }
  await db.from("transactions").delete().in("listing_id", ids);
  await db.from("listings").delete().in("id", ids);
});

/** 支払い待ちの取引を1件用意する */
async function pendingTransaction(label: string) {
  const db = adminDb();
  const { data: listing } = await db
    .from("listings")
    .insert({
      seller_id: sellerId,
      title: `Webhook ${label} ${STAMP}`,
      description: "Webhook の確認用の出品です。",
      category: "road",
      condition: "good",
      price: 78000,
      delivery_method: "shipping",
      shipping_from_pref: "13",
      status: "trading",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  const { data: transaction } = await db
    .from("transactions")
    .insert({
      listing_id: listing!.id,
      seller_id: sellerId,
      buyer_id: buyerId,
      status: "pending_payment",
      price: 78000,
      stripe_session_id: `cs_test_${label}_${STAMP}`,
    })
    .select("id")
    .single();

  return { listingId: listing!.id as string, transactionId: transaction!.id as string };
}

/** Stripe と同じ形式で署名したイベントを送る */
async function sendEvent(
  request: import("@playwright/test").APIRequestContext,
  event: Record<string, unknown>,
  options: { signature?: string; secret?: string } = {},
) {
  const payload = JSON.stringify(event);
  const signature =
    options.signature ??
    Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: options.secret ?? SECRET,
    });

  return request.post(ENDPOINT, {
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    data: payload,
  });
}

function checkoutEvent(
  type: string,
  transactionId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    object: "event",
    type,
    data: {
      object: {
        id: `cs_test_${transactionId}`,
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: `pi_test_${transactionId}`,
        metadata: { transaction_id: transactionId },
        ...overrides,
      },
    },
  };
}

async function statusOf(transactionId: string) {
  const { data } = await adminDb()
    .from("transactions")
    .select("status, stripe_payment_intent_id, canceled_reason")
    .eq("id", transactionId)
    .single();
  return data;
}

test("正しい署名の入金完了で、取引が成立し通知が出る", async ({ request }) => {
  const { transactionId, listingId } = await pendingTransaction("paid");

  const response = await sendEvent(
    request,
    checkoutEvent("checkout.session.completed", transactionId),
  );
  expect(response.status()).toBe(200);

  const transaction = await statusOf(transactionId);
  expect(transaction?.status).toBe("paid");
  expect(transaction?.stripe_payment_intent_id).toBe(`pi_test_${transactionId}`);

  const { data: listing } = await adminDb()
    .from("listings")
    .select("status")
    .eq("id", listingId)
    .single();
  expect(listing?.status).toBe("trading");

  const { data: mails } = await adminDb()
    .from("email_logs")
    .select("kind")
    .eq("ref_id", transactionId);
  const kinds = (mails ?? []).map((row) => row.kind);
  expect(kinds).toContain("purchase_confirmed");
  expect(kinds).toContain("listing_paid_seller");
});

test("同じイベントが再送されても、二重に処理しない", async ({ request }) => {
  const { transactionId } = await pendingTransaction("retry");
  const event = checkoutEvent("checkout.session.completed", transactionId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await sendEvent(request, event);
    expect(response.status(), `${attempt + 1}回目`).toBe(200);
  }

  expect((await statusOf(transactionId))?.status).toBe("paid");

  // 通知も1通ずつのまま
  const { data: mails } = await adminDb()
    .from("email_logs")
    .select("kind")
    .eq("ref_id", transactionId);
  const paidToBuyer = (mails ?? []).filter((row) => row.kind === "purchase_confirmed");
  expect(paidToBuyer).toHaveLength(1);

  // 記録も1回だけ
  const { data: events } = await adminDb()
    .from("transaction_events")
    .select("event")
    .eq("transaction_id", transactionId);
  expect((events ?? []).filter((row) => row.event === "paid")).toHaveLength(1);
});

test("署名が違うイベントは受け付けない", async ({ request }) => {
  const { transactionId } = await pendingTransaction("badsig");
  const event = checkoutEvent("checkout.session.completed", transactionId);

  // 別の鍵で署名
  const wrongKey = await sendEvent(request, event, { secret: "whsec_someone_else" });
  expect(wrongKey.status()).toBe(400);

  // でたらめな署名
  const garbage = await sendEvent(request, event, { signature: "t=1,v1=deadbeef" });
  expect(garbage.status()).toBe(400);

  // 署名そのものが無い
  const none = await request.post(ENDPOINT, {
    headers: { "content-type": "application/json" },
    data: JSON.stringify(event),
  });
  expect(none.status()).toBe(400);

  // どれでも取引は動いていない
  expect((await statusOf(transactionId))?.status).toBe("pending_payment");
});

test("本文を書き換えた再送は弾く", async ({ request }) => {
  const { transactionId } = await pendingTransaction("tamper");
  const original = checkoutEvent("checkout.session.completed", transactionId);
  const payload = JSON.stringify(original);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

  // 署名はそのままに、中身だけ差し替える
  const tampered = JSON.stringify({
    ...original,
    data: { object: { ...(original.data.object as object), payment_status: "paid" }, extra: 1 },
  });

  const response = await request.post(ENDPOINT, {
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    data: tampered,
  });
  expect(response.status()).toBe(400);
  expect((await statusOf(transactionId))?.status).toBe("pending_payment");
});

test("入金がまだのセッション完了では、取引を成立させない", async ({ request }) => {
  const { transactionId } = await pendingTransaction("unpaid");

  const response = await sendEvent(
    request,
    checkoutEvent("checkout.session.completed", transactionId, { payment_status: "unpaid" }),
  );
  expect(response.status()).toBe(200);
  expect((await statusOf(transactionId))?.status).toBe("pending_payment");

  // 後から入金が確定したら成立する
  const later = await sendEvent(
    request,
    checkoutEvent("checkout.session.async_payment_succeeded", transactionId),
  );
  expect(later.status()).toBe(200);
  expect((await statusOf(transactionId))?.status).toBe("paid");
});

test("期限切れで取引が取り消され、商品が購入可能に戻る", async ({ request }) => {
  const { transactionId, listingId } = await pendingTransaction("expired");

  const response = await sendEvent(
    request,
    checkoutEvent("checkout.session.expired", transactionId, { payment_status: "unpaid" }),
  );
  expect(response.status()).toBe(200);

  const transaction = await statusOf(transactionId);
  expect(transaction?.status).toBe("canceled");
  expect(transaction?.canceled_reason).toBe("payment_expired");

  const { data: listing } = await adminDb()
    .from("listings")
    .select("status")
    .eq("id", listingId)
    .single();
  expect(listing?.status).toBe("published");
});

test("入金済みの取引は、遅れて届いた期限切れで取り消されない", async ({ request }) => {
  const { transactionId, listingId } = await pendingTransaction("outoforder");

  await sendEvent(request, checkoutEvent("checkout.session.completed", transactionId));
  expect((await statusOf(transactionId))?.status).toBe("paid");

  // 順序が入れ替わって期限切れが後から届く
  const late = await sendEvent(
    request,
    checkoutEvent("checkout.session.expired", transactionId, { payment_status: "unpaid" }),
  );
  expect(late.status()).toBe(200);

  expect((await statusOf(transactionId))?.status, "支払い済みが取り消された").toBe("paid");
  const { data: listing } = await adminDb()
    .from("listings")
    .select("status")
    .eq("id", listingId)
    .single();
  expect(listing?.status).toBe("trading");
});

test("後払いの入金失敗でも取引が取り消される", async ({ request }) => {
  const { transactionId } = await pendingTransaction("failed");

  const response = await sendEvent(
    request,
    checkoutEvent("checkout.session.async_payment_failed", transactionId, {
      payment_status: "unpaid",
    }),
  );
  expect(response.status()).toBe(200);

  const transaction = await statusOf(transactionId);
  expect(transaction?.status).toBe("canceled");
  expect(transaction?.canceled_reason).toBe("payment_failed");
});

test("身に覚えのない取引 ID でも 200 で受け、状態は変えない", async ({ request }) => {
  // Stripe は 200 以外を返すと再送を続ける。復旧しない失敗で再送を招かない
  const unknown = await sendEvent(
    request,
    checkoutEvent("checkout.session.completed", "00000000-0000-0000-0000-000000000000"),
  );
  expect(unknown.status()).toBe(200);

  const noMetadata = await sendEvent(request, {
    id: "evt_no_metadata",
    object: "event",
    type: "checkout.session.completed",
    data: { object: { id: "cs_x", object: "checkout.session", payment_status: "paid" } },
  });
  expect(noMetadata.status()).toBe(200);
});

test("購読していない種類のイベントは素通りする", async ({ request }) => {
  const response = await sendEvent(request, {
    id: "evt_other",
    object: "event",
    type: "customer.created",
    data: { object: { id: "cus_x", object: "customer" } },
  });
  expect(response.status()).toBe(200);
});

test("チャージバックの申し立ては運営へ通知される", async ({ request }) => {
  const admin = await ensureUser("hook-admin@example.com", "Webhook確認 運営");
  await adminDb().from("users").update({ role: "admin" }).eq("id", admin);

  const before = await adminDb()
    .from("email_logs")
    .select("id", { count: "exact", head: true })
    .eq("kind", "admin_dispute");

  const response = await sendEvent(request, {
    id: "evt_dispute",
    object: "event",
    type: "charge.dispute.created",
    data: {
      object: {
        id: `dp_test_${STAMP}`,
        object: "dispute",
        amount: 78000,
        reason: "fraudulent",
        payment_intent: "pi_test_dispute",
        evidence_details: { due_by: Math.floor(Date.now() / 1000) + 7 * 86400 },
      },
    },
  });
  expect(response.status()).toBe(200);

  const after = await adminDb()
    .from("email_logs")
    .select("id", { count: "exact", head: true })
    .eq("kind", "admin_dispute");
  expect(after.count ?? 0).toBeGreaterThan(before.count ?? 0);

  await adminDb().from("email_logs").delete().eq("kind", "admin_dispute");
});
