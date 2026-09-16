import { test, expect } from "@playwright/test";
import { adminDb, ensureUser, login } from "./helpers";

/**
 * 受渡方法「配送(着払い)」の表示(FR-03-1 の追加分)。
 *
 * 着払いの送料は CycleX の決済を通らないため、購入者が見る金額と実際の
 * 負担額が食い違う。金額を出す画面で必ず注記が出ることを画面側で確かめる。
 * 判定そのものは `src/lib/constants.test.ts` のユニットテストで縛っている。
 */

const SELLER = "cod-seller@example.com";
const BUYER = "cod-buyer@example.com";
const TITLE = `着払いテスト出品 ${Date.now()}`;
const PRICE = 71000;

let listingId = "";

test.beforeAll(async () => {
  const sellerId = await ensureUser(SELLER, "着払いテスト出品者");
  await ensureUser(BUYER, "着払いテスト購入者");

  const db = adminDb();
  const { data: brand } = await db.from("brands").select("id").eq("name", "Trek").maybeSingle();
  const { data, error } = await db
    .from("listings")
    .insert({
      seller_id: sellerId,
      title: TITLE,
      description: "着払いの表示確認用の出品です。状態は良好です。",
      category: "road",
      brand_id: brand?.id ?? null,
      condition: "good",
      price: PRICE,
      delivery_method: "shipping_cod",
      shipping_from_pref: "13",
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // CHECK 制約が古いままだとここで落ちる(移行漏れの検出も兼ねる)
  expect(error, error?.message).toBeNull();
  listingId = data!.id;
});

test.afterAll(async () => {
  const db = adminDb();
  await db.from("transactions").delete().eq("listing_id", listingId);
  await db.from("listings").delete().eq("id", listingId);
});

test("商品ページで着払いと分かり、価格に送料が含まれないことが分かる", async ({ page }) => {
  await page.goto(`/items/${listingId}`);

  await expect(page.getByText("税込(送料は着払い)").first()).toBeVisible();
  await expect(page.getByText("配送(着払い)").first()).toBeVisible();
  // 「送料込み」と読み違えさせない
  await expect(page.getByText("送料込み・税込")).toHaveCount(0);
});

test("購入手続きで送料が別であることを明示する", async ({ page }) => {
  await login(page, BUYER);
  await page.goto(`/items/${listingId}/purchase`);

  await expect(page.getByText("お支払い金額", { exact: true })).toBeVisible();
  await expect(page.getByText("税込(送料は着払い)")).toBeVisible();
  await expect(page.getByText(/上記のお支払い金額に送料は含まれません/)).toBeVisible();
  await expect(page.getByText(/配送業者へ直接お支払いください/)).toBeVisible();
});

test("出品フォームで着払いを選べ、受渡地域は求められない", async ({ page }) => {
  await login(page, SELLER);
  await page.goto("/sell");

  await page.locator("#deliveryMethod").click();
  await expect(page.getByRole("option", { name: "配送(着払い)" })).toBeVisible();
  await page.getByRole("option", { name: "配送(着払い)" }).click();

  // 着払いは配送なので、対面用の受渡地域は出さない
  await expect(page.locator("#meetupPref")).toHaveCount(0);
  await expect(page.locator("#deliveryMethod-hint")).toContainText("購入者が受け取り時に");
});
