import { test, expect, type Page } from "@playwright/test";
import { adminDb, ensureUser, login, TEST_PNG } from "./helpers";

/**
 * 出品の一生(FR-03)。
 * 下書き → 編集 → 公開 → 取下げ → 再公開 と、下書きの削除までを通す。
 * 出品者が自分の商品を管理できることを、画面の操作だけで確認する。
 */

const SELLER = "life-seller@example.com";
const STAMP = Date.now();
const DRAFT_TITLE = `E2E 下書き ${STAMP}`;
const PUBLISHED_TITLE = `E2E 公開出品 ${STAMP}`;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await ensureUser(SELLER, "出品ライフ確認");
});

test.afterAll(async () => {
  const db = adminDb();
  const { data } = await db.from("listings").select("id").like("title", `%${STAMP}%`);
  const ids = (data ?? []).map((row) => row.id);
  if (ids.length === 0) return;
  await db.from("favorites").delete().in("listing_id", ids);
  await db.from("threads").delete().in("listing_id", ids);
  await db.from("listing_images").delete().in("listing_id", ids);
  await db.from("listings").delete().in("id", ids);
});

/** 出品フォームを最低限埋める。title 以外は既定の組み合わせ */
async function fillListingForm(page: Page, title: string, price: string) {
  await page.click("#category");
  await page.click('[role="option"]:has-text("ロードバイク")');
  await page.fill("#title", title);
  await page.click("#brandId");
  await page.click('[role="option"]:has-text("Trek")');
  await page.click("#condition");
  await page.click('[role="option"]:has-text("目立った傷や汚れなし")');
  await page.fill("#description", "E2E で出品の操作を確認するための商品です。状態は良好です。");
  await page.fill("#price", price);
  await page.click("#deliveryMethod");
  await page.click('[role="option"]:has-text("配送")');
  await page.click("#shippingFromPref");
  await page.click('[role="option"]:has-text("東京都")');
}

async function addPhoto(page: Page, name: string) {
  const before = await page.locator('figure img[alt^="商品画像"]').count();
  await page.setInputFiles('input[type="file"]', {
    name,
    mimeType: "image/png",
    buffer: TEST_PNG,
  });
  await expect(page.locator('figure img[alt^="商品画像"]')).toHaveCount(before + 1, {
    timeout: 20_000,
  });
}

test("下書きに保存すると、公開されず下書きタブに入る", async ({ page }) => {
  await login(page, SELLER);
  await page.goto("/sell");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await addPhoto(page, "draft.png");
  await fillListingForm(page, DRAFT_TITLE, "88000");

  await page.click('button:has-text("下書き保存")');
  // 保存すると、そのまま同じ下書きの編集画面に切り替わる
  await page.waitForURL(/\/sell\/[0-9a-f-]+\/edit/, { timeout: 30_000 });
  await expect(page.getByText("下書きを保存しました")).toBeVisible();

  // 下書きタブに入り、公開中には出ない
  await page.goto("/mypage/listings?status=draft");
  await expect(page.getByText(DRAFT_TITLE)).toBeVisible();
  await page.goto("/mypage/listings?status=published");
  await expect(page.getByText(DRAFT_TITLE)).toHaveCount(0);

  // 下書きは検索にも出ない
  await page.goto(`/search?q=${encodeURIComponent(DRAFT_TITLE)}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("0件");
});

test("下書きを編集して公開すると、検索に出る", async ({ page }) => {
  await login(page, SELLER);
  await page.goto("/mypage/listings?status=draft");

  await page.getByRole("button", { name: `${DRAFT_TITLE} の操作` }).click();
  await page.getByRole("menuitem", { name: "編集する" }).click();
  await page.waitForURL(/\/sell\/[0-9a-f-]+\/edit/, { timeout: 20_000 });

  // 保存した内容が戻ってきている
  await expect(page.locator("#title")).toHaveValue(DRAFT_TITLE);
  await expect(page.locator("#price")).toHaveValue("88000");
  await expect(page.locator('figure img[alt^="商品画像"]')).toHaveCount(1);

  await page.fill("#title", PUBLISHED_TITLE);
  await page.fill("#price", "123000");
  await page.click('button:has-text("公開する")');
  await page.waitForURL(/\/items\//, { timeout: 30_000 });

  await expect(page.getByRole("heading", { level: 1 })).toContainText(PUBLISHED_TITLE);
  await expect(page.getByText("¥123,000")).toBeVisible();

  await page.goto(`/search?q=${encodeURIComponent(PUBLISHED_TITLE)}`);
  await expect(page.locator("article").first()).toContainText(PUBLISHED_TITLE);
});

test("公開中の商品には下書き保存が出ない", async ({ page }) => {
  await login(page, SELLER);
  await page.goto("/mypage/listings?status=published");
  await page.getByRole("button", { name: `${PUBLISHED_TITLE} の操作` }).click();
  await page.getByRole("menuitem", { name: "編集する" }).click();
  await page.waitForURL(/\/sell\/[0-9a-f-]+\/edit/, { timeout: 20_000 });

  await expect(page.getByRole("button", { name: "下書き保存" })).toHaveCount(0);
  // すでに公開されているので「公開する」ではなく保存として見せる
  await expect(page.getByRole("button", { name: "変更を保存" })).toBeVisible();
  await expect(page.getByRole("button", { name: "公開する" })).toHaveCount(0);
});

test("写真を足して並べ替え、消せる", async ({ page }) => {
  await login(page, SELLER);
  await page.goto("/mypage/listings?status=published");
  await page.getByRole("button", { name: `${PUBLISHED_TITLE} の操作` }).click();
  await page.getByRole("menuitem", { name: "編集する" }).click();
  await page.waitForURL(/\/sell\/[0-9a-f-]+\/edit/, { timeout: 20_000 });

  await addPhoto(page, "second.png");
  await addPhoto(page, "third.png");

  const first = () => page.locator('figure img[alt^="商品画像"]').first();
  const before = await first().getAttribute("src");

  // 2枚目を先頭へ動かすと、1枚目が入れ替わる
  await page.getByRole("button", { name: "2枚目を前へ" }).click();
  await expect.poll(() => first().getAttribute("src")).not.toBe(before);

  // 3枚目を消すと2枚になる
  await page.getByRole("button", { name: "3枚目を削除" }).click();
  await expect(page.locator('figure img[alt^="商品画像"]')).toHaveCount(2);

  await page.click('button:has-text("変更を保存")');
  await page.waitForURL(/\/items\//, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "2枚目を表示" })).toBeVisible();
});

test("取下げると検索から消え、再公開すると戻る", async ({ page }) => {
  await login(page, SELLER);
  await page.goto("/mypage/listings?status=published");

  await page.getByRole("button", { name: `${PUBLISHED_TITLE} の操作` }).click();
  await page.getByRole("menuitem", { name: "取下げる" }).click();
  await expect(page.getByText("取下げました")).toBeVisible({ timeout: 20_000 });

  await page.goto(`/search?q=${encodeURIComponent(PUBLISHED_TITLE)}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("0件");

  await page.goto("/mypage/listings?status=withdrawn");
  await expect(page.getByText(PUBLISHED_TITLE)).toBeVisible();
  await page.getByRole("button", { name: `${PUBLISHED_TITLE} の操作` }).click();
  await page.getByRole("menuitem", { name: "再公開する" }).click();
  await expect(page.getByText("再公開しました")).toBeVisible({ timeout: 20_000 });

  await page.goto(`/search?q=${encodeURIComponent(PUBLISHED_TITLE)}`);
  await expect(page.locator("article").first()).toContainText(PUBLISHED_TITLE);
});

test("下書きは確認してから削除される", async ({ page }) => {
  const title = `E2E 削除用の下書き ${STAMP}`;

  await login(page, SELLER);
  await page.goto("/sell");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await fillListingForm(page, title, "45000");
  await page.click('button:has-text("下書き保存")');
  await page.waitForURL(/\/sell\/[0-9a-f-]+\/edit/, { timeout: 30_000 });

  await page.goto("/mypage/listings?status=draft");
  await page.getByRole("button", { name: `${title} の操作` }).click();
  await page.getByRole("menuitem", { name: "削除する" }).click();

  // いきなり消さず、確認を挟む
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("元に戻せません");
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  await page.goto("/mypage/listings?status=draft");
  await expect(page.getByText(title)).toBeVisible();

  await page.getByRole("button", { name: `${title} の操作` }).click();
  await page.getByRole("menuitem", { name: "削除する" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "削除する" }).click();
  await expect(page.getByText("下書きを削除しました")).toBeVisible({ timeout: 20_000 });

  await page.goto("/mypage/listings?status=draft");
  await expect(page.getByText(title)).toHaveCount(0);
});
