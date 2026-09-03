import { test, expect } from "@playwright/test";
import { adminDb, ensureUser, login, TEST_PNG } from "./helpers";

/**
 * 主要動線のスモークテスト(Phase 8)。
 * 登録済みユーザーでログイン → 出品 → 検索 → 詳細 → お気に入り までを1本で通す。
 *
 * 決済は Stripe Checkout への遷移を伴うため対象外(ユニットテストと手動確認で担保)。
 */

const SELLER = "e2e-seller@example.com";
const BUYER = "e2e-buyer@example.com";
const TITLE = `E2E テスト出品 ${Date.now()}`;
const LONG_DESCRIPTION = Array.from(
  { length: 14 },
  (_, i) => `${i + 1}行目: E2E テスト用の出品です。状態は良好で、試乗のみの使用です。`,
).join("\n");

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await ensureUser(SELLER, "E2E出品者");
  await ensureUser(BUYER, "E2E購入者");
});

// 実行のたびに出品が積み上がると、画面確認のときに邪魔になる
test.afterAll(async () => {
  const db = adminDb();
  const { data } = await db.from("listings").select("id").like("title", "E2E テスト出品%");
  const ids = (data ?? []).map((row) => row.id);
  if (ids.length === 0) return;
  await db.from("favorites").delete().in("listing_id", ids);
  await db.from("threads").delete().in("listing_id", ids);
  await db.from("listings").delete().in("id", ids);
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

test("検索窓が候補と履歴を出す", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  const box = page.getByRole("combobox", { name: "キーワード検索" });

  // カタカナで打っても英字のブランドを出す(結果の絞り込みと同じ読み替え)
  await box.fill("ピナ");
  await expect(page.getByRole("option", { name: /Pinarello/ })).toBeVisible();

  // カテゴリ名も候補になる
  await box.fill("ロード");
  await expect(page.getByRole("option", { name: /ロードバイク/ })).toBeVisible();

  // 候補を押すとその語で検索できる
  await box.fill("ピナ");
  await page.getByRole("option", { name: /Pinarello/ }).click();
  await expect(page).toHaveURL(/\/search\?q=Pinarello/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pinarello");

  // 検索した語は履歴に残る
  await page.goto("/");
  await page.getByRole("combobox", { name: "キーワード検索" }).click();
  await expect(page.getByRole("option", { name: /Pinarello/ })).toBeVisible();

  // 入力を消せる
  await page.getByRole("combobox", { name: "キーワード検索" }).fill("テスト");
  await page.getByRole("button", { name: "キーワードを消す" }).click();
  await expect(page.getByRole("combobox", { name: "キーワード検索" })).toHaveValue("");
});

test("シートを開かずにカテゴリと価格帯で絞り込める", async ({ page }) => {
  await page.goto("/search");
  const heading = page.getByRole("heading", { level: 1 });
  const countOf = async () => Number((await heading.innerText()).replace(/[^0-9]/g, ""));

  const all = await countOf();
  expect(all).toBeGreaterThan(0);

  await page.getByRole("link", { name: "ロードバイク", exact: true }).click();
  await expect(page).toHaveURL(/category=road/);
  const roadOnly = await countOf();
  expect(roadOnly).toBeLessThan(all);

  // 価格帯は重ねて効く
  await page.getByRole("link", { name: "15〜30万円" }).click();
  await expect(page).toHaveURL(/category=road.*price_min=150000/);
  expect(await countOf()).toBeLessThanOrEqual(roadOnly);

  // 同じ価格帯をもう一度押すと解除される
  await page.getByRole("link", { name: "15〜30万円" }).click();
  await expect(page).not.toHaveURL(/price_min/);
  expect(await countOf()).toBe(roadOnly);

  // 「すべて」でカテゴリが外れる
  await page.getByRole("link", { name: "すべて", exact: true }).click();
  await expect(page).not.toHaveURL(/category/);
  expect(await countOf()).toBe(all);
});

test("未ログインで会員ページを開くとログインへ誘導される", async ({ page }) => {
  await page.goto("/mypage");
  await expect(page).toHaveURL(/\/login\?next=%2Fmypage/);
});

test("必須が抜けたまま公開すると、足りない項目がまとめて示される", async ({ page }) => {
  await login(page, SELLER);
  await page.goto("/sell");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "公開する" }).click();

  const summary = page.getByRole("alert").filter({ hasText: "入力内容を確認してください" });
  await expect(summary).toBeVisible({ timeout: 20_000 });
  await expect(summary).toContainText("商品画像");
  await expect(summary).toContainText("カテゴリ");
  await expect(summary).toContainText("希望価格");

  // まとめの項目を押すと、その入力欄まで移動する
  await summary.getByRole("button", { name: /カテゴリ:/ }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const rect = document.getElementById("category")?.getBoundingClientRect();
        return rect ? rect.top > 0 && rect.bottom < window.innerHeight : false;
      }),
    )
    .toBe(true);
});

test("入力途中で離れても、戻れば内容を復元できる", async ({ page }) => {
  const title = `復元テスト ${Date.now()}`;
  await login(page, SELLER);
  await page.goto("/sell");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.fill("#title", title);
  await page.fill("#description", "入力途中で別の画面へ移動したときの確認です。");
  // 控えを取るまで少し待つ
  await page.waitForTimeout(1200);

  // スマホでは画面下のタブから誤って移動しやすい
  await page.goto("/");
  await page.goto("/sell");

  await page.getByRole("button", { name: "入力内容を復元する" }).click();
  await expect(page.locator("#title")).toHaveValue(title);
  await expect(page.locator("#description")).toHaveValue(
    "入力途中で別の画面へ移動したときの確認です。",
  );
});

test("出品 → 検索でヒット → 詳細 → お気に入り", async ({ page }) => {
  // --- 出品 ---
  await login(page, SELLER);
  await page.goto("/sell");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

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
  // 折りたたみの確認も兼ねて、10行に収まらない長さにする
  await page.fill("#description", LONG_DESCRIPTION);
  await page.fill("#price", "123456");
  await page.click("#deliveryMethod");
  await page.click('[role="option"]:has-text("配送")');
  await page.click("#shippingFromPref");
  await page.click('[role="option"]:has-text("東京都")');

  await page.click('button:has-text("公開する")');
  await page.waitForURL(/\/items\//, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(TITLE);

  // --- 長い説明は畳まれ、開くと全文が出る ---
  const more = page.getByRole("button", { name: "続きを読む" });
  await expect(more).toBeVisible();
  const collapsed = await page.evaluate(() => document.body.scrollHeight);
  await more.click();
  await expect(page.getByRole("button", { name: "閉じる" })).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollHeight)).toBeGreaterThan(collapsed);

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
  // 関連商品のカードにも同じボタンが並ぶため、商品名の付かないこの商品のものを選ぶ
  const favorite = page.getByRole("button", { name: "お気に入りに追加", exact: true });
  await favorite.first().click();
  await expect(
    page.getByRole("button", { name: "お気に入りから削除", exact: true }).first(),
  ).toBeVisible({ timeout: 15_000 });

  await page.goto("/mypage/favorites");
  // 過去の実行分が残っていても通るよう、順序ではなく存在で判定する
  await expect(page.locator("article", { hasText: TITLE })).toHaveCount(1);
});

test("写真を拡大して前後に送れる", async ({ page }) => {
  // 写真が複数ある出品を探す。無ければこの確認は飛ばす
  await page.goto("/search");
  const hrefs = await page
    .locator('a[href^="/items/"]')
    .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute("href") ?? ""))]);

  let found = false;
  for (const href of hrefs.slice(0, 12)) {
    await page.goto(href);
    if ((await page.getByRole("button", { name: "2枚目を表示" }).count()) > 0) {
      found = true;
      break;
    }
  }
  test.skip(!found, "写真が2枚以上ある出品が見当たらない");

  const slider = page
    .locator("div.relative")
    .filter({ has: page.getByRole("button", { name: "画像を拡大表示" }) })
    .first();
  const dialog = page.getByRole("dialog");
  const dialogCounter = dialog.locator("span.tabular-nums");

  await page.getByRole("button", { name: "画像を拡大表示" }).click();
  await expect(dialogCounter).toHaveText(/^1 \//);

  const total = Number(((await dialogCounter.textContent()) ?? "").split("/")[1].trim());
  expect(total).toBeGreaterThan(1);

  // ボタンで最後まで送る。途中の位置がスクロールから流れてきても番号は戻らない
  for (let i = 1; i < total; i += 1) {
    await dialog.getByRole("button", { name: "次の画像" }).click();
    await expect(dialogCounter).toHaveText(new RegExp(`^${i + 1} /`));
  }

  // 末尾では「次の画像」が押せなくなりフォーカスが外れる。
  // それでも戻れること(キーをダイアログではなく画面全体で受けていること)を確かめる
  await page.keyboard.press("ArrowLeft");
  await expect(dialogCounter).toHaveText(new RegExp(`^${total - 1} /`));

  // 拡大表示で送った位置は、閉じたあとの本体にも引き継がれる
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(slider.locator("span.tabular-nums")).toHaveText(new RegExp(`^${total - 1} /`));
});

test("ページを送ると、見ている件数の範囲が変わる", async ({ page }) => {
  await page.goto("/search");
  const heading = page.getByRole("heading", { level: 1 });
  const next = page.getByRole("link", { name: "次へ" });
  test.skip((await next.count()) === 0, "全件が1ページに収まっていて確認できない");

  await expect(heading).toContainText(/件中 1〜\d+件/);
  await next.click();
  await expect(page).toHaveURL(/page=2/);
  await expect(heading).toContainText(/件中 \d+〜\d+件/);
  await expect(heading).not.toContainText(/件中 1〜/);
});
