import { test, expect, type Page } from "@playwright/test";
import { adminDb, ensureUser, login } from "./helpers";

/**
 * 取引の異常系と通知(FR-08 / FR-09 / FR-10 / FR-13)。
 *
 * 通知は Resend を設定していない環境ではメールを飛ばさず記録だけ残るので、
 * その記録(email_logs)で「誰に・何を送ったか」を確かめる。
 */

const STAMP = Date.now();
const SELLER = "edge-seller@example.com";
const BUYER = "edge-buyer@example.com";

let sellerId = "";
let buyerId = "";
let listingId = "";

test.describe.configure({ mode: "serial" });

async function createListing(title: string, status = "published") {
  const { data } = await adminDb()
    .from("listings")
    .insert({
      seller_id: sellerId,
      title,
      description: "取引の異常系を確認するための出品です。",
      category: "road",
      condition: "good",
      price: 64000,
      delivery_method: "shipping",
      shipping_from_pref: "13",
      status,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return data!.id as string;
}

/** その取引について送られた通知の種別を集める */
async function mailKinds(refId: string): Promise<string[]> {
  const { data } = await adminDb()
    .from("email_logs")
    .select("kind, user_id, status")
    .eq("ref_id", refId)
    .order("created_at");
  return (data ?? []).map((row) => row.kind);
}

test.beforeAll(async () => {
  sellerId = await ensureUser(SELLER, "異常系テスト出品者");
  buyerId = await ensureUser(BUYER, "異常系テスト購入者");
  listingId = await createListing(`異常系の確認 ${STAMP}`);
});

test.afterAll(async () => {
  const db = adminDb();
  const { data } = await db.from("listings").select("id").like("title", `%${STAMP}%`);
  const ids = (data ?? []).map((row) => row.id);
  if (ids.length === 0) return;
  const { data: txs } = await db.from("transactions").select("id").in("listing_id", ids);
  const txIds = (txs ?? []).map((row) => row.id);
  if (txIds.length > 0) {
    await db.from("reviews").delete().in("transaction_id", txIds);
    await db.from("transaction_events").delete().in("transaction_id", txIds);
    await db.from("email_logs").delete().in("ref_id", txIds);
  }
  await db.from("transactions").delete().in("listing_id", ids);
  await db.from("threads").delete().in("listing_id", ids);
  await db.from("listings").delete().in("id", ids);
});

async function payThrough(page: Page, targetListingId: string) {
  await login(page, BUYER);
  await page.goto(`/items/${targetListingId}/purchase`);
  await page.getByRole("button", { name: /を支払う/ }).click();
  await page.waitForURL(/\/purchase\/demo/, { timeout: 30_000 });
  await page.getByRole("button", { name: /を支払う\(デモ\)/ }).click();
  await page.waitForURL(/\/purchase\/complete/, { timeout: 30_000 });
}

test("支払いのたびに、買い手と売り手それぞれに通知が残る", async ({ page }) => {
  await payThrough(page, listingId);

  const { data: transaction } = await adminDb()
    .from("transactions")
    .select("id, status")
    .eq("listing_id", listingId)
    .single();
  expect(transaction?.status).toBe("paid");

  const kinds = await mailKinds(transaction!.id);
  expect(kinds, JSON.stringify(kinds)).toContain("purchase_confirmed");
  expect(kinds).toContain("listing_paid_seller");
});

test("取引中の商品は編集できない", async ({ page }) => {
  await login(page, SELLER);

  await page.goto("/mypage/listings?status=trading");
  await expect(page.getByText(`異常系の確認 ${STAMP}`)).toBeVisible();

  // 直接 URL を叩いても編集画面には入れない
  const response = await page.goto(`/sell/${listingId}/edit`);
  expect(response?.status()).toBe(200);
  await expect(page.getByText("この商品は編集できません")).toBeVisible();
});

test("発送・受取のたびに相手へ通知が残る", async ({ page }) => {
  const { data: transaction } = await adminDb()
    .from("transactions")
    .select("id")
    .eq("listing_id", listingId)
    .single();

  await login(page, SELLER);
  await page.goto(`/transactions/${transaction!.id}`);
  await page.locator("textarea").first().fill("本日ヤマト便で発送しました。伝票番号は 1234-5678-9012 です。");
  await page.getByRole("button", { name: "発送を連絡する" }).click();

  // 消えるトースト頼みにせず、画面に残る状態で確かめる
  await expect(page.getByText("発送・受渡連絡済み")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("1234-5678-9012")).toBeVisible();

  await expect.poll(() => mailKinds(transaction!.id), { timeout: 20_000 }).toContain("tx_shipped");

  await login(page, BUYER);
  await page.goto(`/transactions/${transaction!.id}`);
  await page.getByRole("button", { name: "受け取りました" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "受取を確認する" }).click();
  await expect(page.getByRole("link", { name: /評価を登録/ })).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => mailKinds(transaction!.id), { timeout: 20_000 }).toContain("tx_received");
});

test("評価は一度きりで、片側だけのうちは公開されない", async ({ page }) => {
  const { data: transaction } = await adminDb()
    .from("transactions")
    .select("id")
    .eq("listing_id", listingId)
    .single();

  await login(page, BUYER);
  await page.goto(`/transactions/${transaction!.id}/review`);
  await page.getByRole("button", { name: "5 / 5" }).click();
  await page.locator("textarea").fill("丁寧な梱包で、状態も説明どおりでした。");
  await page.getByRole("button", { name: "評価を登録する" }).click();
  await page.waitForURL(/reviewed=1/, { timeout: 30_000 });

  // 同じ人はもう一度登録できない
  await page.goto(`/transactions/${transaction!.id}/review`);
  await expect(page.getByText(/すでに評価を登録/)).toBeVisible();

  // 相手の評価が揃うまでは公開されない
  const { data: reviews } = await adminDb()
    .from("reviews")
    .select("is_published, reviewer_id")
    .eq("transaction_id", transaction!.id);
  expect(reviews).toHaveLength(1);
  expect(reviews?.[0]?.is_published).toBe(false);

  // 出品者のプロフィールにもまだ出ない
  await page.goto(`/users/${sellerId}`);
  await expect(page.getByText("丁寧な梱包で、状態も説明どおりでした。")).toHaveCount(0);

  // 相手にも評価を促す通知が残る
  await expect
    .poll(() => mailKinds(transaction!.id), { timeout: 20_000 })
    .toContain("review_requested");
});

test("双方が評価すると公開され、取引が完了する", async ({ page }) => {
  const { data: transaction } = await adminDb()
    .from("transactions")
    .select("id")
    .eq("listing_id", listingId)
    .single();

  await login(page, SELLER);
  await page.goto(`/transactions/${transaction!.id}/review`);
  await page.getByRole("button", { name: "5 / 5" }).click();
  await page.locator("textarea").fill("スムーズにお取引いただきました。");
  await page.getByRole("button", { name: "評価を登録する" }).click();
  await page.waitForURL(/reviewed=1/, { timeout: 30_000 });

  const { data: after } = await adminDb()
    .from("transactions")
    .select("status")
    .eq("id", transaction!.id)
    .single();
  expect(after?.status).toBe("completed");

  const { data: reviews } = await adminDb()
    .from("reviews")
    .select("is_published")
    .eq("transaction_id", transaction!.id);
  expect(reviews).toHaveLength(2);
  expect(reviews?.every((review) => review.is_published)).toBe(true);

  // 公開されたので、相手のプロフィールに出る
  await page.goto(`/users/${sellerId}`);
  await expect(page.getByText("丁寧な梱包で、状態も説明どおりでした。")).toBeVisible();

  await expect.poll(() => mailKinds(transaction!.id), { timeout: 20_000 }).toContain("tx_completed");
});

test("支払われないまま放置された取引は片付けられ、商品が戻る", async ({ request }) => {
  const staleListingId = await createListing(`期限切れの確認 ${STAMP}`, "trading");
  const { data: transaction } = await adminDb()
    .from("transactions")
    .insert({
      listing_id: staleListingId,
      seller_id: sellerId,
      buyer_id: buyerId,
      status: "pending_payment",
      price: 64000,
      // 掃除の対象になるよう、十分に古くしておく
      created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  // 実際の入口(日次バッチ)を通す。鍵が無ければ弾かれることも確かめる
  const secret = process.env.CRON_SECRET;
  test.skip(!secret, "CRON_SECRET が設定されていない");

  const denied = await request.get("/api/cron/daily");
  expect(denied.status(), "鍵なしでは実行できない").toBe(401);

  const response = await request.get("/api/cron/daily", {
    headers: { authorization: `Bearer ${secret}` },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { canceledStalePayments: number };
  expect(body.canceledStalePayments).toBeGreaterThan(0);

  const { data: after } = await adminDb()
    .from("transactions")
    .select("status, canceled_reason")
    .eq("id", transaction!.id)
    .single();
  expect(after?.status).toBe("canceled");

  const { data: listing } = await adminDb()
    .from("listings")
    .select("status")
    .eq("id", staleListingId)
    .single();
  expect(listing?.status).toBe("published");
});
