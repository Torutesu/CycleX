import { test, expect } from "@playwright/test";
import { adminDb, ensureUser, login, TEST_PNG } from "./helpers";

/**
 * 配送(着払い)の出品と購入。
 *
 * 着払いの送料はサイトの決済を通らず、購入者が受け取り時に配送業者へ払う。
 * 商品代金に送料が入っていないことを、出品者・購入者の双方が取り違えないかを見る。
 */

const STAMP = Date.now();
const SELLER = "collect-seller@example.com";
const BUYER = "collect-buyer@example.com";
const TITLE = `着払いの出品 ${STAMP}`;

test.describe.configure({ mode: "serial" });

let listingId = "";

test.beforeAll(async () => {
  await ensureUser(SELLER, "着払い出品者");
  await ensureUser(BUYER, "着払い購入者");
});

test.afterAll(async () => {
  const db = adminDb();
  const { data } = await db.from("listings").select("id").like("title", `%${STAMP}%`);
  const ids = (data ?? []).map((row) => row.id);
  if (ids.length === 0) return;
  await db.from("transactions").delete().in("listing_id", ids);
  await db.from("threads").delete().in("listing_id", ids);
  await db.from("listing_images").delete().in("listing_id", ids);
  await db.from("listings").delete().in("id", ids);
});

test("出品フォームで配送(着払い)を選んで公開できる", async ({ page }) => {
  await login(page, SELLER);
  await page.goto("/sell");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.setInputFiles('input[type="file"]', {
    name: "collect.png",
    mimeType: "image/png",
    buffer: TEST_PNG,
  });
  await expect(page.locator('figure img[alt^="商品画像"]')).toHaveCount(1, { timeout: 20_000 });

  await page.click("#category");
  await page.click('[role="option"]:has-text("ロードバイク")');
  await page.fill("#title", TITLE);
  await page.click("#brandId");
  await page.click('[role="option"]:has-text("Trek")');
  await page.click("#condition");
  await page.click('[role="option"]:has-text("目立った傷や汚れなし")');
  await page.fill("#description", "着払いで発送する出品を確認するための商品です。");
  await page.fill("#price", "45000");

  // 受渡方法の選択肢に着払いがあり、選ぶと送料の扱いが案内される
  await page.click("#deliveryMethod");
  await expect(page.getByRole("option")).toHaveText([
    "配送(送料込み)",
    "配送(着払い)",
    "対面(手渡し)",
  ]);
  await page.getByRole("option", { name: "配送(着払い)" }).click();
  await expect(page.getByText("送料は購入者が受け取り時に配送業者へ支払い")).toBeVisible();

  await page.click("#shippingFromPref");
  await page.click('[role="option"]:has-text("大阪府")');
  await page.click('button:has-text("公開する")');
  await page.waitForURL(/\/items\//, { timeout: 30_000 });
  listingId = page.url().split("/items/")[1].split(/[?#]/)[0];

  // 商品ページでは、価格に送料が入っていないことが価格のすぐ横でわかる
  await expect(page.getByText("税込・送料は着払い")).toBeVisible();
  await expect(page.getByText("送料込み・税込")).toHaveCount(0);
  await expect(page.getByText("配送(着払い)").first()).toBeVisible();

  const { data } = await adminDb()
    .from("listings")
    .select("delivery_method, status")
    .eq("id", listingId)
    .single();
  expect(data).toEqual({ delivery_method: "shipping_collect", status: "published" });
});

test("購入画面で着払いを明示し、購入後は出品者に着払いでの発送を案内する", async ({ page }) => {
  await login(page, BUYER);
  await page.goto(`/items/${listingId}/purchase`);
  await expect(page.getByText("この商品は送料が着払いです")).toBeVisible();
  await expect(page.getByText("配送業者へ送料をお支払いください")).toBeVisible();

  // サイトで支払うのは商品代金だけ
  await page.getByRole("button", { name: "¥45,000 を支払う" }).click();
  await expect(page).toHaveURL(/\/purchase\/demo/, { timeout: 30_000 });
  await page.getByRole("button", { name: /を支払う\(デモ\)/ }).click();
  await expect(page).toHaveURL(/\/purchase\/complete/, { timeout: 30_000 });

  const { data: tx } = await adminDb()
    .from("transactions")
    .select("id, price, status")
    .eq("listing_id", listingId)
    .single();
  expect(tx?.price).toBe(45000);
  expect(tx?.status).toBe("paid");

  // 購入者は通常の配送と同じく、お届け先を伝える
  await page.goto(`/transactions/${tx!.id}`);
  await expect(page.getByText("お届け先をお伝えください")).toBeVisible();

  // 出品者には、着払いで発送するよう案内が出る
  await login(page, SELLER);
  await page.goto(`/transactions/${tx!.id}`);
  await expect(page.getByRole("heading", { name: "商品を発送してください" })).toBeVisible();
  await expect(page.getByText("着払いで発送してご連絡ください")).toBeVisible();
  await expect(page.locator("#shipping-note")).toHaveAttribute("placeholder", /着払い/);
});

test("着払い以外の受渡方法は、データベースが受け付けない", async () => {
  const { error } = await adminDb()
    .from("listings")
    .update({ delivery_method: "cash_on_delivery" })
    .eq("id", listingId);
  expect(error?.message).toContain("listings_delivery_method_check");
});
