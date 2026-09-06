import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ensureUser, login } from "./helpers";
import { adminDb } from "./helpers";

/**
 * アクセシビリティの自動検査。
 *
 * axe で機械的に分かる違反(コントラスト・ラベル・見出し・名前のない操作)を
 * 主要画面で見る。自動検査で拾えるのは全体の一部だが、
 * 見落としがちなところを継続的に押さえられる。
 */

const USER = "a11y@example.com";
let itemId = "";

test.beforeAll(async () => {
  await ensureUser(USER, "アクセシビリティ確認");
  const { data } = await adminDb()
    .from("listings")
    .select("id")
    .eq("status", "published")
    .limit(1)
    .maybeSingle();
  itemId = data?.id ?? "";
});

/** 違反を「どの規則が・どこで」の形にして読めるようにする */
async function violations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  return result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.slice(0, 3).map((node) => ({
      target: node.target.join(" "),
      html: node.html.slice(0, 160),
      why: node.failureSummary?.replace(/\s+/g, " ").slice(0, 200),
    })),
  }));
}

const GUEST_PAGES: [name: string, path: string][] = [
  ["ホーム", "/"],
  ["検索", "/search"],
  ["ログイン", "/login"],
  ["会員登録", "/signup"],
  ["利用規約", "/terms"],
  ["特定商取引法に基づく表記", "/tokushoho"],
];

for (const [name, path] of GUEST_PAGES) {
  test(`${name}に自動検査で分かる違反が無い`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    expect(await violations(page)).toEqual([]);
  });
}

test("商品ページに自動検査で分かる違反が無い", async ({ page }) => {
  test.skip(!itemId, "公開中の商品がない");
  await page.goto(`/items/${itemId}`, { waitUntil: "networkidle" });
  expect(await violations(page)).toEqual([]);
});

test("会員向けの画面に自動検査で分かる違反が無い", async ({ page }) => {
  await login(page, USER);
  for (const path of ["/mypage", "/sell", "/messages", "/mypage/settings"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    expect(await violations(page), path).toEqual([]);
  }
});

test("PC 幅でも自動検査で分かる違反が無い", async ({ page }) => {
  // 絞り込みのサイドバーなど、広い画面でしか出ない部分を見る
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const path of ["/", "/search"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    expect(await violations(page), path).toEqual([]);
  }
});

test("押した状態でも文字が読める", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  // 主ボタンは、ホバーで薄くすると白文字とのコントラストが落ちる
  const button = page.getByRole("link", { name: "商品をさがす" }).first();
  await button.hover();
  const colors = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor };
  });

  // 背景に透明度が混ざっていないこと(混ざると下地が透けて薄くなる)
  expect(colors.background, JSON.stringify(colors)).not.toMatch(/\/\s*0?\.\d/);
});

test("キーボードだけで検索して商品を開ける", async ({ page }) => {
  await page.goto("/");

  // Tab で検索窓まで進める
  const box = page.getByRole("combobox", { name: "キーワード検索" });
  await box.focus();
  await page.keyboard.type("Trek");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/search\?q=Trek/, { timeout: 20_000 });

  // 一覧の最初の商品まで Tab で辿り着き、Enter で開ける
  const firstItem = page.locator('article a[href^="/items/"]').first();
  await firstItem.focus();
  await expect(firstItem).toBeFocused();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/items\//, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("フォーカスした要素が目で見て分かる", async ({ page }) => {
  await page.goto("/login");

  const outline = await page.locator("#email").evaluate((element) => {
    element.focus();
    const style = getComputedStyle(element);
    return {
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      borderColor: style.borderColor,
    };
  });

  // outline かリング(box-shadow)のどちらかで示されていること
  const hasRing =
    outline.boxShadow !== "none" || parseFloat(outline.outlineWidth || "0") > 0;
  expect(hasRing, JSON.stringify(outline)).toBe(true);
});

test("見出しが h1 から始まり、飛び級しない", async ({ page }) => {
  for (const path of ["/", "/search", "/login"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    // 画面に出ている見出しだけを見る(幅で隠している列は読み上げにも出ない)
    const levels = await page.locator("h1, h2, h3, h4, h5, h6").evaluateAll((elements) =>
      elements
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => Number(el.tagName.slice(1))),
    );

    expect(levels.length, path).toBeGreaterThan(0);
    expect(levels[0], `${path} の最初の見出し`).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - levels[i - 1], `${path} の見出しの飛び級`).toBeLessThanOrEqual(1);
    }
  }
});

test("装飾でない画像に説明が付いている", async ({ page }) => {
  test.skip(!itemId, "公開中の商品がない");
  await page.goto(`/items/${itemId}`, { waitUntil: "networkidle" });

  const missing = await page.locator("img").evaluateAll((images) =>
    images
      .filter((image) => !image.hasAttribute("alt"))
      .map((image) => image.getAttribute("src") ?? "(src なし)"),
  );
  expect(missing).toEqual([]);
});
