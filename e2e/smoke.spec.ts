import { test, expect } from "@playwright/test";
import { ensureUser, login, TEST_PNG } from "./helpers";

/**
 * 主要動線のスモークテスト(Phase 8)。
 * 登録済みユーザーでログイン → 出品 → 検索 → 詳細 → お気に入り までを1本で通す。
 *
 * 決済は Stripe Checkout への遷移を伴うため対象外(ユニットテストと手動確認で担保)。
 */

const SELLER = "e2e-seller@example.com";
const BUYER = "e2e-buyer@example.com";
const TITLE = `E2E テスト出品 ${Date.now()}`;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await ensureUser(SELLER, "E2E出品者");
  await ensureUser(BUYER, "E2E購入者");
});

test("ゲストはホームと検索を閲覧できる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "カテゴリから探す" })).toBeVisible();

  // スマホ幅では下部タブバーが出る
  await expect(page.getByRole("navigation", { name: "メインナビゲーション" })).toBeVisible();

  await page.goto("/search");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("商品をさがす");

  // 横スクロールが発生しないこと
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows).toBe(false);
});

test("未ログインで会員ページを開くとログインへ誘導される", async ({ page }) => {
  await page.goto("/mypage");
  await expect(page).toHaveURL(/\/login\?next=%2Fmypage/);
});

test("出品 → 検索でヒット → 詳細 → お気に入り", async ({ page }) => {
  // --- 出品 ---
  await login(page, SELLER);
  await page.goto("/sell");

  await page.setInputFiles('input[type="file"]', {
    name: "bike.png",
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
  await page.fill("#description", "E2E テスト用の出品です。状態は良好で、試乗のみの使用です。");
  await page.fill("#price", "123456");
  await page.click("#deliveryMethod");
  await page.click('[role="option"]:has-text("配送")');
  await page.click("#shippingFromPref");
  await page.click('[role="option"]:has-text("東京都")');

  await page.click('button:has-text("公開する")');
  await page.waitForURL(/\/items\//, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(TITLE);

  // --- 検索でヒットする ---
  await page.goto(`/search?q=${encodeURIComponent(TITLE)}`);
  await expect(page.locator("article").first()).toContainText(TITLE);

  // --- 購入者としてお気に入り登録 ---
  await page.goto("/mypage");
  await page.click('button[aria-label="アカウントメニュー"]');
  await page.click('button:has-text("ログアウト")');
  await page.waitForURL("/", { timeout: 20_000 });

  await login(page, BUYER);
  await page.goto(`/search?q=${encodeURIComponent(TITLE)}`);
  const itemHref = await page.locator("article a").first().getAttribute("href");
  expect(itemHref).toBeTruthy();

  await page.goto(itemHref!);
  await page.locator('button[aria-label="お気に入りに追加"]').first().click();
  await expect(page.locator('button[aria-label="お気に入りから削除"]').first()).toBeVisible({
    timeout: 15_000,
  });

  await page.goto("/mypage/favorites");
  await expect(page.locator("article").first()).toContainText(TITLE);
});
