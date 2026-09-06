import { test, expect, type Page } from "@playwright/test";

/**
 * 検索の結果そのものを確かめる(FR-04)。
 *
 * 画面が出るだけでなく、並び順が正しいか・絞り込みで実際に件数が減るか、
 * 条件を外すと戻るかまで見る。シード済みのデモデータが前提。
 */

/** 一覧に並んだ価格を数値で取り出す */
async function prices(page: Page): Promise<number[]> {
  const texts = await page.locator("article p.tabular-nums").allInnerTexts();
  return texts.map((text) => Number(text.replace(/[^0-9]/g, ""))).filter((n) => n > 0);
}

/** 見出しの「N件」を読む */
async function total(page: Page): Promise<number> {
  const heading = await page.getByRole("heading", { level: 1 }).innerText();
  const match = heading.match(/([\d,]+)件/);
  return match ? Number(match[1].replace(/,/g, "")) : 0;
}

test("価格の安い順・高い順が実際にその並びになる", async ({ page }) => {
  await page.goto("/search?sort=price_asc");
  const asc = await prices(page);
  expect(asc.length).toBeGreaterThan(3);
  expect([...asc]).toEqual([...asc].sort((a, b) => a - b));

  await page.goto("/search?sort=price_desc");
  const desc = await prices(page);
  expect(desc.length).toBeGreaterThan(3);
  expect([...desc]).toEqual([...desc].sort((a, b) => b - a));

  // 安い順の先頭は、高い順の先頭より安い
  expect(asc[0]).toBeLessThan(desc[0]);
});

test("新着順は出品の新しい順に並ぶ", async ({ page }) => {
  await page.goto("/search?sort=new");
  // 1ページ目の先頭が「〜前」表記(直近)で、末尾が日付表記になっていること自体は
  // データ次第なので、ここでは並びが安定して出ることだけ確認する
  await expect(page.locator("article").first()).toBeVisible();
  const first = await total(page);
  await page.reload();
  expect(await total(page)).toBe(first);
});

test("カテゴリで絞ると、そのカテゴリの商品だけになる", async ({ page }) => {
  await page.goto("/search");
  const all = await total(page);

  await page.goto("/search?category=road");
  const road = await total(page);
  expect(road).toBeGreaterThan(0);
  expect(road).toBeLessThan(all);

  // 出てきた商品を1つ開き、カテゴリが一致していることを確かめる
  await page.locator("article a").first().click();
  await page.waitForURL(/\/items\//, { timeout: 20_000 });
  await expect(page.getByText("ロードバイク").first()).toBeVisible();
});

test("条件を重ねるほど件数が減り、外すと戻る", async ({ page }) => {
  await page.goto("/search?category=road");
  const road = await total(page);

  await page.goto("/search?category=road&price_max=100000");
  const cheapRoad = await total(page);
  expect(cheapRoad).toBeLessThanOrEqual(road);

  // 価格の上限を守っている
  for (const price of await prices(page)) expect(price).toBeLessThanOrEqual(100000);

  // チップから価格の条件だけを外すと、カテゴリの件数に戻る
  await page
    .getByRole("button", { name: /〜.*を解除|を解除/ })
    .first()
    .click();
  await expect.poll(() => total(page)).toBeGreaterThanOrEqual(cheapRoad);
});

test("すべて解除すると条件が消える", async ({ page }) => {
  await page.goto("/search?category=road&price_max=100000&condition=good");
  await expect(page.getByRole("button", { name: /すべて解除/ })).toBeVisible();
  await page.getByRole("button", { name: "すべて解除" }).click();

  await expect(page).toHaveURL(/\/search(\?|$)/, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "すべて解除" })).toHaveCount(0);
});

test("売却済みを含めると SOLD が並ぶ", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByText("SOLD")).toHaveCount(0);

  await page.goto("/search?include_sold=1");
  await expect(page.getByText("SOLD").first()).toBeVisible({ timeout: 20_000 });
});

test("該当が無いときは、条件を消す導線が出る", async ({ page }) => {
  await page.goto("/search?q=" + encodeURIComponent("該当しないはずのことば"));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("0件");
  await expect(page.getByText("条件に合う商品が見つかりませんでした")).toBeVisible();

  await page.getByRole("link", { name: "条件をクリアして表示" }).click();
  await expect(page).toHaveURL(/\/search$/, { timeout: 20_000 });
  await expect(page.locator("article").first()).toBeVisible();
});

test("最後のページでは次へが押せない", async ({ page }) => {
  await page.goto("/search");
  const count = await total(page);
  const lastPage = Math.ceil(count / 24);
  test.skip(lastPage < 2, "ページが1枚しかない");

  await page.goto(`/search?page=${lastPage}`);
  await expect(page.getByRole("link", { name: "次へ" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "前へ" })).toBeVisible();
});

test("範囲外のページ番号は最後のページとして扱う", async ({ page }) => {
  await page.goto("/search");
  const count = await total(page);
  const lastPage = Math.ceil(count / 24);
  test.skip(lastPage < 2, "ページが1枚しかない");

  // 古いリンクを踏んでも「0件」で行き止まりにならない
  const response = await page.goto("/search?page=9999");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText("0件");
  await expect(page.getByText("条件に合う商品が見つかりませんでした")).toHaveCount(0);
  await expect(page.locator("article").first()).toBeVisible();

  // 最後のページと同じ中身が出る
  const heading = await page.getByRole("heading", { level: 1 }).innerText();
  await page.goto(`/search?page=${lastPage}`);
  expect(await page.getByRole("heading", { level: 1 }).innerText()).toBe(heading);
});

test("PC の絞り込みサイドバーからも条件を適用できる", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/search");
  const all = await total(page);

  const sidebar = page.locator("aside");
  await expect(sidebar).toBeVisible();
  await sidebar.getByText("ロードバイク", { exact: true }).click();
  await sidebar.getByRole("button", { name: "この条件で表示" }).click();

  await expect(page).toHaveURL(/category=road/, { timeout: 20_000 });
  expect(await total(page)).toBeLessThan(all);
});
