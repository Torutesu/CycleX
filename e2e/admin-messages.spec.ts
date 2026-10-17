import { test, expect } from "@playwright/test";
import { adminDb, ensureUser, login } from "./helpers";

/**
 * 運営による取引メッセージの確認(閲覧のみ)。
 *
 * トラブルの申し出があったとき、運営が購入者と出品者のやり取りを確かめられること。
 * 見ても当事者の既読は変わらず、誰が見たかは操作記録に残ること。
 * 一般の会員からは見えないこと。
 */

const STAMP = Date.now();
const SELLER = "msgview-seller@example.com";
const BUYER = "msgview-buyer@example.com";
const ADMIN = "msgview-admin@example.com";
const TITLE = `メッセージ確認の取引 ${STAMP}`;

test.describe.configure({ mode: "serial" });

let adminId = "";
let txId = "";
let listingId = "";

test.beforeAll(async () => {
  const db = adminDb();
  const sellerId = await ensureUser(SELLER, "確認される出品者");
  const buyerId = await ensureUser(BUYER, "確認される購入者");
  adminId = await ensureUser(ADMIN, "メッセージ確認の運営");
  await db.from("users").update({ role: "admin" }).eq("id", adminId);

  const { data: listing } = await db
    .from("listings")
    .insert({
      seller_id: sellerId,
      title: TITLE,
      description: "運営のメッセージ確認を確かめるための出品です。",
      category: "road",
      condition: "good",
      price: 30000,
      delivery_method: "shipping",
      shipping_from_pref: "13",
      status: "trading",
      published_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    })
    .select("id")
    .single();
  listingId = listing!.id;

  const paidAt = new Date(Date.now() - 3600_000);
  const { data: tx } = await db
    .from("transactions")
    .insert({
      listing_id: listingId,
      seller_id: sellerId,
      buyer_id: buyerId,
      status: "paid",
      price: 30000,
      paid_at: paidAt.toISOString(),
      created_at: new Date(paidAt.getTime() - 60_000).toISOString(),
    })
    .select("id")
    .single();
  txId = tx!.id;

  const { data: thread } = await db
    .from("threads")
    .insert({ listing_id: listingId, buyer_id: buyerId })
    .select("id")
    .single();

  const at = (minutes: number) => new Date(paidAt.getTime() + minutes * 60_000).toISOString();
  await db.from("messages").insert([
    // 購入前の質問
    { thread_id: thread!.id, sender_id: buyerId, body: "購入前の質問です。", created_at: at(-30) },
    { thread_id: thread!.id, sender_id: sellerId, body: "購入前の回答です。", created_at: at(-20) },
    // 購入後のお届け先の連絡
    {
      thread_id: thread!.id,
      sender_id: buyerId,
      body: "お届け先は東京都テスト区1-2-3です。",
      created_at: at(5),
    },
    {
      thread_id: thread!.id,
      sender_id: sellerId,
      body: "承知しました。明日発送します。",
      created_at: at(10),
    },
  ]);
});

test.afterAll(async () => {
  const db = adminDb();
  await db.from("admin_audit_logs").delete().eq("admin_id", adminId);
  await db.from("transactions").delete().eq("listing_id", listingId);
  await db.from("threads").delete().eq("listing_id", listingId);
  await db.from("listings").delete().eq("id", listingId);
});

test("運営は取引管理から、購入者と出品者のやり取りを確認できる", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/admin/transactions");
  await page
    .locator("tr", { hasText: TITLE })
    .getByRole("link", { name: "詳細・メッセージ" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/admin/transactions/${txId}`), { timeout: 20_000 });

  const list = page.getByRole("list", { name: "メッセージ" });
  const items = list.getByRole("listitem");
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText("購入者(確認される購入者)");
  await expect(items.nth(0)).toContainText("購入前の質問です。");
  await expect(items.nth(1)).toContainText("出品者(確認される出品者)");
  // 購入前の質問と購入後のやり取りの境目がわかる
  await expect(items.nth(2)).toContainText("ここから購入後");
  await expect(items.nth(2)).toContainText("お届け先は東京都テスト区1-2-3です。");
  await expect(items.nth(3)).toContainText("明日発送します");

  // 運営からは書き込めない
  await expect(page.locator("textarea")).toHaveCount(0);

  // 見ても当事者の既読にはならない
  const { data: unread } = await adminDb()
    .from("messages")
    .select("id, threads!inner(listing_id)")
    .eq("threads.listing_id", listingId)
    .is("read_at", null);
  expect(unread).toHaveLength(4);

  // 誰がどの取引のメッセージを見たかが残る
  await expect
    .poll(
      async () => {
        const { data } = await adminDb()
          .from("admin_audit_logs")
          .select("action, target_type, target_id")
          .eq("admin_id", adminId)
          .eq("action", "view_messages");
        return data;
      },
      { timeout: 20_000 },
    )
    .toEqual([{ action: "view_messages", target_type: "transaction", target_id: txId }]);
});

test("一般の会員は、当事者でも運営の確認画面を開けない", async ({ page }) => {
  await login(page, BUYER);
  const response = await page.goto(`/admin/transactions/${txId}`);
  expect(response?.status()).toBe(404);
  await expect(page.locator("body")).not.toContainText("お届け先は東京都テスト区");
});
