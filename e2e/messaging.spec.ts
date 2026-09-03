import { test, expect } from "@playwright/test";
import { adminDb, ensureUser, login } from "./helpers";

/**
 * やりとりと通報(FR-07 / FR-11)。
 * 質問 → 返信 → 未読の解消 と、商品の通報を通しで確認する。
 */

const ADMIN = "msg-admin@example.com";
const SELLER = "msg-seller@example.com";
const BUYER = "msg-buyer@example.com";
const TITLE = `やりとりテスト出品 ${Date.now()}`;

let sellerId = "";
let listingId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  sellerId = await ensureUser(SELLER, "やりとり出品者");
  await ensureUser(BUYER, "やりとり購入者");

  // 通報の確認に管理者が要る。テスト用の会員を管理者に上げる
  const adminId = await ensureUser(ADMIN, "通報確認スタッフ");
  await adminDb().from("users").update({ role: "admin" }).eq("id", adminId);

  const { data } = await adminDb()
    .from("listings")
    .insert({
      seller_id: sellerId,
      title: TITLE,
      description: "やりとりの確認用の出品です。",
      category: "cross",
      condition: "good",
      price: 52000,
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
  await db.from("reports").delete().eq("target_id", listingId);
  await db.from("listings").delete().eq("id", listingId);
});

test("出品者に質問 → 返信 → 未読バッジが消える", async ({ page }) => {
  // --- 購入者が質問する ---
  await login(page, BUYER);
  await page.goto(`/items/${listingId}`);
  await page.getByRole("button", { name: "出品者に質問" }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("textarea").fill("こちらまだ販売中でしょうか。試乗は可能ですか。");
  await dialog.getByRole("button", { name: "送信する" }).click();
  await expect(page).toHaveURL(/\/messages\//, { timeout: 20_000 });
  await expect(page.getByText("こちらまだ販売中でしょうか。試乗は可能ですか。")).toBeVisible();

  // --- 出品者側に未読が立つ ---
  await login(page, SELLER);
  await page.goto("/");
  const tabBar = page.getByRole("navigation", { name: "メインナビゲーション" });
  await expect(tabBar.getByText("1", { exact: true })).toBeVisible();

  // --- 出品者が返信する ---
  await page.goto("/messages");
  await expect(page.getByText("こちらまだ販売中でしょうか。試乗は可能ですか。")).toBeVisible();
  await page.locator('a[href^="/messages/"]').first().click();

  // 開いた時点で既読になる。読み込み直さなくてもバッジは消える
  await expect(tabBar.getByText("1", { exact: true })).toHaveCount(0);

  const composer = page.locator("textarea");
  await composer.fill("販売中です。試乗もご相談いただけます。");
  await page.getByRole("button", { name: "送信" }).click();

  // 送信の往復を待たずに、入力欄は空になり自分の吹き出しが出る
  await expect(composer).toHaveValue("");
  await expect(page.getByText("販売中です。試乗もご相談いただけます。")).toBeVisible({
    timeout: 20_000,
  });

  // --- 読み込み直しても未読は戻らない ---
  await page.goto("/");
  await expect(tabBar.getByText("1", { exact: true })).toHaveCount(0);
});

test("商品を通報すると管理画面に届く", async ({ page }) => {
  await login(page, BUYER);
  await page.goto(`/items/${listingId}`);
  await page.getByRole("button", { name: "この商品を通報する" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: "禁止出品物" }).click();
  await dialog.locator("textarea").fill("防犯登録の記載がなく、盗難車の可能性があります。");
  await dialog.getByRole("button", { name: "通報する" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // --- 管理者が内容を確認できる ---
  await login(page, ADMIN);
  await page.goto("/admin/reports");
  await expect(page.getByText("防犯登録の記載がなく、盗難車の可能性があります。")).toBeVisible();
});
