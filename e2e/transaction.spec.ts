import { test, expect, type Page } from "@playwright/test";
import { adminDb, ensureUser, login } from "./helpers";

/**
 * 取引の通し(FR-08 / FR-09)。
 *
 * 購入 → 支払い → 発送 → 受取確認 → 相互評価 → 取引完了 までを1本で検証する。
 * 支払いは Stripe を構成していない環境向けのデモ決済を使うが、
 * 確定処理は本番の Webhook と同じ関数を通るため、状態遷移は本番と同じ経路。
 */

const SELLER = "tx-seller@example.com";
const BUYER = "tx-buyer@example.com";
const TITLE = `取引テスト出品 ${Date.now()}`;
const PRICE = 48000;

test.describe.configure({ mode: "serial" });

let sellerId = "";
let listingId = "";

test.beforeAll(async () => {
  sellerId = await ensureUser(SELLER, "取引テスト出品者");
  await ensureUser(BUYER, "取引テスト購入者");

  // 画面から出品すると時間がかかるので、商品は直接用意する
  const db = adminDb();
  const { data: brand } = await db.from("brands").select("id").eq("name", "Trek").maybeSingle();
  const { data } = await db
    .from("listings")
    .insert({
      seller_id: sellerId,
      title: TITLE,
      description: "取引の通し確認用の出品です。",
      category: "road",
      brand_id: brand?.id ?? null,
      condition: "good",
      price: PRICE,
      delivery_method: "shipping",
      shipping_from_pref: "13",
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  listingId = data!.id;
});

test.afterAll(async () => {
  const db = adminDb();
  await db.from("transactions").delete().eq("listing_id", listingId);
  await db.from("listings").delete().eq("id", listingId);
});

async function openTransaction(page: Page): Promise<string> {
  await page.goto("/mypage/purchases");
  const href = await page.locator('a[href^="/transactions/"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  return href!;
}

test("購入 → 支払い → 発送 → 受取確認 → 相互評価", async ({ page }) => {
  // --- 購入者が購入する ---
  await login(page, BUYER);
  await page.goto(`/items/${listingId}`);
  await page.getByRole("link", { name: "購入手続きへ" }).first().click();
  await expect(page).toHaveURL(/\/purchase$/);
  await expect(page.getByText("¥48,000").first()).toBeVisible();

  await page.getByRole("button", { name: /を支払う/ }).click();
  await expect(page).toHaveURL(/\/purchase\/demo/, { timeout: 30_000 });
  await expect(page.getByText("これはデモ用の決済画面です")).toBeVisible();

  await page.getByRole("button", { name: /を支払う\(デモ\)/ }).click();
  await expect(page).toHaveURL(/\/purchase\/complete/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ご購入ありがとうございます");

  // --- 商品が取引中になり、他の人は買えなくなる ---
  const txPath = await openTransaction(page);
  await page.goto(`/items/${listingId}`);
  await expect(page.getByRole("link", { name: "購入手続きへ" })).toHaveCount(0);

  // --- 購入者にはお届け先を伝える案内が出る ---
  await page.goto(txPath);
  await expect(page.getByRole("heading", { name: "お届け先をお伝えください" })).toBeVisible();
  await expect(page.getByRole("link", { name: "メッセージを開く" })).toBeVisible();

  // --- 出品者が発送を連絡する ---
  await login(page, SELLER);
  await page.goto(txPath);
  await expect(page.getByRole("heading", { name: "商品を発送してください" })).toBeVisible();
  await page.fill("#shipping-note", "ヤマト運輸 1234-5678-9012 で発送しました");
  await page.getByRole("button", { name: "発送を連絡する" }).click();
  await expect(page.getByRole("heading", { name: "購入者の受取確認をお待ちください" })).toBeVisible(
    {
      timeout: 20_000,
    },
  );

  // --- 購入者が受取確認する ---
  await login(page, BUYER);
  await page.goto(txPath);
  await expect(page.getByText("ヤマト運輸 1234-5678-9012 で発送しました")).toBeVisible();
  await page.getByRole("button", { name: "受け取りました" }).click();
  // 取り消せない操作なので確認ダイアログが挟まる
  await expect(page.getByRole("dialog")).toContainText("受取を確認しますか");
  await page.getByRole("button", { name: "受取を確認する" }).click();
  await expect(page.getByRole("heading", { name: "取引相手を評価してください" })).toBeVisible({
    timeout: 20_000,
  });

  // --- 購入者が評価する ---
  await page.getByRole("link", { name: "評価を登録する" }).click();
  await expect(page).toHaveURL(/\/review$/);
  await page.getByRole("button", { name: "5 / 5" }).click();
  await page.fill("#comment", "梱包が丁寧でした。ありがとうございました。");
  await page.getByRole("button", { name: "評価を登録する" }).click();
  // 登録できたら取引画面へ戻る。評価画面に留まったままなら失敗している
  await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]+\?reviewed=1$/, { timeout: 20_000 });

  // --- 出品者も評価すると取引が完了する ---
  await login(page, SELLER);
  await page.goto(`${txPath}/review`);
  await page.getByRole("button", { name: "5 / 5" }).click();
  await page.fill("#comment", "スムーズなお取引でした。");
  await page.getByRole("button", { name: "評価を登録する" }).click();
  await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]+\?reviewed=1$/, { timeout: 20_000 });

  // 双方の評価がそろった時点で取引が完了する
  await expect
    .poll(
      async () => {
        const { data } = await adminDb()
          .from("transactions")
          .select("status")
          .eq("listing_id", listingId)
          .single();
        return data?.status;
      },
      { timeout: 20_000 },
    )
    .toBe("completed");

  await page.goto(txPath);
  await expect(page.getByRole("heading", { name: "取引が完了しました" })).toBeVisible();

  // --- 商品が売却済みになり、評価が公開される ---
  {
    const { data } = await adminDb().from("listings").select("status").eq("id", listingId).single();
    expect(data?.status).toBe("sold");
  }
  // 出品者には所有者向けの操作が出るため、来訪者としての見え方で確かめる
  await page.context().clearCookies();
  await page.goto(`/items/${listingId}`);
  await expect(page.getByRole("button", { name: "SOLD" })).toBeVisible();

  await page.goto(`/users/${sellerId}`);
  await expect(page.getByText("梱包が丁寧でした。ありがとうございました。")).toBeVisible();
});

test("支払いをやめると商品が購入可能に戻る", async ({ page }) => {
  const db = adminDb();
  const { data: listing } = await db
    .from("listings")
    .insert({
      seller_id: sellerId,
      title: `${TITLE} 取消`,
      description: "支払い取消の確認用です。",
      category: "road",
      condition: "good",
      price: 30000,
      delivery_method: "shipping",
      shipping_from_pref: "13",
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  await login(page, BUYER);
  await page.goto(`/items/${listing!.id}`);
  await page.getByRole("link", { name: "購入手続きへ" }).first().click();
  await page.getByRole("button", { name: /を支払う/ }).click();
  await expect(page).toHaveURL(/\/purchase\/demo/, { timeout: 30_000 });

  await page.getByRole("button", { name: "支払いをやめる" }).click();
  await expect(page).toHaveURL(/\/items\//, { timeout: 30_000 });
  await expect(page.getByRole("link", { name: "購入手続きへ" }).first()).toBeVisible();

  await db.from("transactions").delete().eq("listing_id", listing!.id);
  await db.from("listings").delete().eq("id", listing!.id);
});
