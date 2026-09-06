import { test, expect } from "@playwright/test";
import { adminDb, ensureUser, login, TEST_PNG } from "./helpers";

/**
 * 境界と異常系。
 * 上限・売り切れ・二重購入・退会した相手など、壊れやすいところをまとめて見る。
 */

const STAMP = Date.now();
const SELLER = "limit-seller@example.com";
const BUYER_A = "limit-buyer-a@example.com";
const BUYER_B = "limit-buyer-b@example.com";
const GONE = `limit-gone-${STAMP}@example.com`;

let sellerId = "";
let goneId = "";
let soldListingId = "";
let raceListingId = "";
let goneListingId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  sellerId = await ensureUser(SELLER, "上限テスト出品者");
  await ensureUser(BUYER_A, "上限テスト購入者A");
  await ensureUser(BUYER_B, "上限テスト購入者B");
  goneId = await ensureUser(GONE, "退会予定の出品者");

  const db = adminDb();
  const base = {
    description: "境界の確認用の出品です。",
    category: "road",
    condition: "good",
    delivery_method: "shipping",
    shipping_from_pref: "13",
    published_at: new Date().toISOString(),
  };

  const { data: sold } = await db
    .from("listings")
    .insert({
      ...base,
      seller_id: sellerId,
      title: `売切れ確認 ${STAMP}`,
      price: 51000,
      status: "sold",
    })
    .select("id")
    .single();
  soldListingId = sold!.id;

  const { data: race } = await db
    .from("listings")
    .insert({
      ...base,
      seller_id: sellerId,
      title: `二重購入確認 ${STAMP}`,
      price: 52000,
      status: "published",
    })
    .select("id")
    .single();
  raceListingId = race!.id;

  const { data: gone } = await db
    .from("listings")
    .insert({
      ...base,
      seller_id: goneId,
      title: `退会者の出品 ${STAMP}`,
      price: 53000,
      status: "published",
    })
    .select("id")
    .single();
  goneListingId = gone!.id;
});

test.afterAll(async () => {
  const db = adminDb();
  const ids = [soldListingId, raceListingId, goneListingId].filter(Boolean);
  await db.from("transactions").delete().in("listing_id", ids);
  await db.from("threads").delete().in("listing_id", ids);
  await db.from("reports").delete().in("target_id", ids);
  await db.from("listings").delete().in("id", ids);
  await db.from("users").update({ status: "active" }).eq("id", goneId);
});

test("売り切れの商品は買えない", async ({ page }) => {
  await login(page, BUYER_A);
  await page.goto(`/items/${soldListingId}`);

  // 主ボタンは PC 用とスマホ用の2つが描かれる。画面幅で出ているほうを見る
  await expect(page.getByRole("button", { name: "SOLD" }).last()).toBeVisible();
  await expect(page.getByRole("link", { name: "購入手続きへ" })).toHaveCount(0);

  // 古いリンクで購入手続きを直接開いても、行き止まりにせず商品ページへ戻す
  await page.goto(`/items/${soldListingId}/purchase`);
  await expect(page).toHaveURL(new RegExp(`/items/${soldListingId}$`));
  await expect(page.getByRole("button", { name: /を支払う/ })).toHaveCount(0);
});

test("先に手続きしている人がいると、あとの人は買えない", async ({ page }) => {
  // 先客の取引を1件立てておく
  const buyerA = await ensureUser(BUYER_A, "上限テスト購入者A");
  await adminDb().from("transactions").insert({
    listing_id: raceListingId,
    seller_id: sellerId,
    buyer_id: buyerA,
    status: "pending_payment",
    price: 52000,
  });

  await login(page, BUYER_B);
  await page.goto(`/items/${raceListingId}/purchase`);
  await page.getByRole("button", { name: /を支払う/ }).click();

  await expect(page.getByText(/他の方が購入手続き中|現在購入できません/)).toBeVisible({
    timeout: 20_000,
  });

  // 取引は増えていない
  const { count } = await adminDb()
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("listing_id", raceListingId);
  expect(count).toBe(1);
});

test("退会した出品者の商品は買えず、やりとりも送れない", async ({ page }) => {
  // 先に質問だけしておく
  await login(page, BUYER_A);
  await page.goto(`/items/${goneListingId}`);
  await page.getByRole("button", { name: "出品者に質問" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("こちらまだ販売中でしょうか。");
  await dialog.getByRole("button", { name: "送信する" }).click();
  await expect(page).toHaveURL(/\/messages\//, { timeout: 20_000 });
  const threadUrl = page.url();

  // 出品者が退会する。退会処理は本人の出品も取下げるので、そこまで再現する
  await adminDb()
    .from("users")
    .update({ status: "withdrawn", display_name: "退会済みユーザー" })
    .eq("id", goneId);
  await adminDb().from("listings").update({ status: "withdrawn" }).eq("seller_id", goneId);

  await page.goto(threadUrl);
  await expect(page.getByText(/退会済みのため、新しいメッセージは送信できません/)).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);

  // 退会に伴って出品も取下げられるので、商品ページごと見えなくなる
  const itemResponse = await page.goto(`/items/${goneListingId}`);
  expect(itemResponse?.status()).toBe(404);
  const purchaseResponse = await page.goto(`/items/${goneListingId}/purchase`);
  expect(purchaseResponse?.status()).toBe(404);
});

test("入力の上限を超えて打てない", async ({ page }) => {
  await login(page, SELLER);
  await page.goto("/sell");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  // タイトルは80文字まで
  await page.locator("#title").fill("あ".repeat(120));
  expect((await page.locator("#title").inputValue()).length).toBe(80);
  await expect(page.getByText("80 / 80")).toBeVisible();

  // 説明は2000文字まで
  await page.locator("#description").fill("い".repeat(2400));
  expect((await page.locator("#description").inputValue()).length).toBe(2000);
});

test("価格は下限と上限の外だと公開できない", async ({ page }) => {
  await login(page, SELLER);
  await page.goto("/sell");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.setInputFiles('input[type="file"]', {
    name: "price.png",
    mimeType: "image/png",
    buffer: TEST_PNG,
  });
  await expect(page.locator('figure img[alt^="商品画像"]')).toHaveCount(1, { timeout: 20_000 });

  await page.click("#category");
  await page.click('[role="option"]:has-text("ロードバイク")');
  await page.fill("#title", `価格の境界 ${STAMP}`);
  await page.click("#brandId");
  await page.click('[role="option"]:has-text("Trek")');
  await page.click("#condition");
  await page.click('[role="option"]:has-text("目立った傷や汚れなし")');
  await page.fill("#description", "価格の境界を確認するための出品です。");
  await page.click("#deliveryMethod");
  await page.click('[role="option"]:has-text("配送")');
  await page.click("#shippingFromPref");
  await page.click('[role="option"]:has-text("東京都")');

  // 下限より安い
  await page.fill("#price", "100");
  await page.click('button:has-text("公開する")');
  await expect(page.getByText(/300円/).first()).toBeVisible({ timeout: 20_000 });

  // 上限より高い
  await page.fill("#price", "20000000");
  await page.click('button:has-text("公開する")');
  await expect(page.getByText(/9,999,999円|9999999/).first()).toBeVisible({ timeout: 20_000 });

  await expect(page).toHaveURL(/\/sell/);
});

test("画像は10枚までしか追加できない", async ({ page }) => {
  await login(page, SELLER);
  await page.goto("/sell");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  const files = Array.from({ length: 12 }, (_, i) => ({
    name: `bulk-${i}.png`,
    mimeType: "image/png",
    buffer: TEST_PNG,
  }));
  await page.setInputFiles('input[type="file"]', files);

  // 入れられるぶんだけ受け取り、その旨を知らせる
  await expect(page.getByText("残り10枚のみ追加しました")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('figure img[alt^="商品画像"]')).toHaveCount(10, { timeout: 30_000 });
  // 10枚に達したら、追加の枠は消え、まとめ追加のボタンも押せなくなる
  await expect(page.getByRole("button", { name: "画像を追加", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "画像を追加(10/10)" })).toBeDisabled();
});

test("同じ商品を続けて通報できない", async ({ page }) => {
  const { data: listing } = await adminDb()
    .from("listings")
    .insert({
      seller_id: sellerId,
      title: `通報の重複確認 ${STAMP}`,
      description: "通報の重複を確認するための出品です。",
      category: "road",
      condition: "good",
      price: 54000,
      delivery_method: "shipping",
      shipping_from_pref: "13",
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  await login(page, BUYER_A);
  await page.goto(`/items/${listing!.id}`);

  for (const attempt of [1, 2]) {
    await page.getByRole("button", { name: "この商品を通報する" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio").first().click();
    await dialog.getByRole("button", { name: "通報する" }).click();

    if (attempt === 1) {
      await expect(page.getByText("通報を受け付けました。運営で内容を確認します。")).toBeVisible({
        timeout: 20_000,
      });
      await page.goto(`/items/${listing!.id}`);
    } else {
      // 同じ対象への2回目は、対応が終わるまで受け付けない
      await expect(page.getByText(/対応中/)).toBeVisible({ timeout: 20_000 });
    }
  }

  const { count } = await adminDb()
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("target_id", listing!.id);
  expect(count).toBe(1);

  await adminDb().from("reports").delete().eq("target_id", listing!.id);
  await adminDb().from("listings").delete().eq("id", listing!.id);
});

test("ログアウトすると会員向けの画面に入れない", async ({ page }) => {
  await login(page, BUYER_A);
  await page.goto("/mypage");
  await expect(page).toHaveURL(/\/mypage/);

  await page.click('button[aria-label="アカウントメニュー"]');
  await page.click('button:has-text("ログアウト")');
  await page.waitForURL("/", { timeout: 20_000 });

  for (const path of ["/mypage", "/messages", "/sell", "/mypage/listings"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login/);
  }
});
