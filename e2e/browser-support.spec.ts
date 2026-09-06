import { test, expect, type Page } from "@playwright/test";
import { adminDb, ensureUser, login } from "./helpers";

/**
 * 他のブラウザでの見え方。
 *
 * この環境では Chromium しか用意できないため、Chrome 系にしか無い機能を
 * 使っている箇所について「その機能が無いブラウザ」を作って確かめる。
 * 対象は Safari と Firefox に無い次の2つ。
 *
 * - field-sizing: content  … 入力欄が中身に合わせて伸びる
 * - word-break: auto-phrase … 日本語を文節で折り返す
 *
 * どちらも「無ければ壊れる」ではなく「無くても使える」ことを確かめる。
 */

const USER = "compat@example.com";
let itemId = "";

test.beforeAll(async () => {
  await ensureUser(USER, "他ブラウザ確認");
  const { data } = await adminDb()
    .from("listings")
    .select("id")
    .eq("status", "published")
    .limit(1)
    .maybeSingle();
  itemId = data?.id ?? "";
});

/** Chrome にしか無い2つの機能を、無いことにして読み込む */
async function withoutChromeOnlyCss(page: Page) {
  await page.addInitScript(() => {
    const original = CSS.supports.bind(CSS);
    const stub = (...args: string[]) => {
      const text = args.join(" ");
      if (text.includes("field-sizing") || text.includes("auto-phrase")) return false;
      return original(args[0], args[1] as string);
    };
    (CSS as unknown as { supports: unknown }).supports = stub;
  });
}

/**
 * 該当のプロパティを実際に無効にする。
 * Tailwind の指定はレイヤーの中にあり、外から !important を足しても勝てないので、
 * 要素に直接(inline かつ important で)当てる。
 */
async function disableChromeOnlyCss(page: Page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>("textarea")) {
      element.style.setProperty("field-sizing", "fixed", "important");
    }
    for (const element of document.querySelectorAll<HTMLElement>(".break-phrase")) {
      element.style.setProperty("word-break", "normal", "important");
    }
  });

  // 実際に無効化できたことを確かめる(無効にできていない検査は意味が無い)
  const stillOn = await page.evaluate(() => {
    const textarea = document.querySelector("textarea");
    if (!textarea) return false;
    return getComputedStyle(textarea).getPropertyValue("field-sizing").trim() === "content";
  });
  expect(stillOn, "field-sizing を無効にできていない").toBe(false);
}

test("入力欄が伸びない環境でも、長文がちゃんと見える", async ({ page }) => {
  await withoutChromeOnlyCss(page);
  await login(page, USER);
  await page.goto("/sell");
  await disableChromeOnlyCss(page);

  const description = page.locator("#description");
  const before = await description.boundingBox();
  expect(before, "入力前の高さが取れていない").toBeTruthy();

  // 既定の行数(8行)に収まるうちは、高さは変わらなくてよい
  await description.fill(Array.from({ length: 4 }, (_, i) => `${i + 1}行目です。`).join("\n"));
  await page.waitForTimeout(200);
  const short = await description.boundingBox();
  expect(short!.height, "収まっているのに縮んでいる").toBeGreaterThanOrEqual(before!.height - 2);

  // 行数を超えたら伸びる
  await description.fill(Array.from({ length: 16 }, (_, i) => `${i + 1}行目です。`).join("\n"));
  await page.waitForTimeout(200);
  const long = await description.boundingBox();
  expect(long!.height, "行数を超えても伸びていない").toBeGreaterThan(before!.height + 40);

  // 打った文字が窓の外へ隠れていない
  const overflow = await description.evaluate(
    (element: HTMLTextAreaElement) => element.scrollHeight - element.clientHeight,
  );
  expect(overflow, "入力欄の中で文字が隠れている").toBeLessThanOrEqual(2);
});

test("入力欄が伸びない環境でも、メッセージの窓が使える", async ({ page }) => {
  const db = adminDb();
  const { data: user } = await db.from("users").select("id").eq("email", USER).single();
  const { data: thread } = await db
    .from("threads")
    .select("id")
    .eq("buyer_id", user!.id)
    .limit(1)
    .maybeSingle();

  let threadId = thread?.id;
  if (!threadId && itemId) {
    const { data: created } = await db
      .from("threads")
      .insert({ listing_id: itemId, buyer_id: user!.id })
      .select("id")
      .single();
    threadId = created?.id;
  }
  test.skip(!threadId, "やりとりを用意できない");

  await withoutChromeOnlyCss(page);
  await login(page, USER);
  await page.goto(`/messages/${threadId}`);
  await disableChromeOnlyCss(page);

  const composer = page.locator("textarea");
  const before = await composer.boundingBox();
  await composer.fill(
    "はじめまして。こちらの商品について伺いたいことがあります。\nフレームサイズは実測で何センチでしょうか。\nまた、輪行袋は付属しますか。",
  );
  await page.waitForTimeout(300);

  const after = await composer.boundingBox();
  expect(after!.height).toBeGreaterThan(before!.height);
  // 上限は超えない(画面を覆ってしまわない)
  expect(after!.height).toBeLessThanOrEqual(160);
});

test("文節で折り返せない環境でも、見出しが枠からはみ出さない", async ({ page }) => {
  test.skip(!itemId, "公開中の商品がない");

  await withoutChromeOnlyCss(page);
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/items/${itemId}`, { waitUntil: "networkidle" });
    await disableChromeOnlyCss(page);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, `${width}px で横スクロールが出た`).toBe(false);

    const title = page.getByRole("heading", { level: 1 });
    const box = await title.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width);
  }
});

test("色の指定が古い環境でも、文字が読めなくならない", async ({ page }) => {
  // oklch や color-mix が効かない環境では、色そのものが落ちる。
  // そのとき文字色と背景色が同じになって読めなくならないことを見る。
  await page.goto("/", { waitUntil: "networkidle" });

  const sameColor = await page.evaluate(() => {
    const bad: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("main *, header *")) {
      if (element.children.length > 0) continue;
      const text = element.textContent?.trim();
      if (!text) continue;
      const style = getComputedStyle(element);
      // 背景が透明なら親の色が透ける。ここでは指定がある要素だけを見る
      if (style.backgroundColor === "rgba(0, 0, 0, 0)") continue;
      if (style.color === style.backgroundColor) bad.push(text.slice(0, 20));
    }
    return bad;
  });

  expect(sameColor).toEqual([]);
});
