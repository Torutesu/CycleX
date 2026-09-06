import { test, expect, type Page } from "@playwright/test";
import { adminDb, ensureUser, login } from "./helpers";

/**
 * 画面の崩れを機械的に見張る。
 *
 * 320px から 1280px まで主要な画面を開き、
 * 横にはみ出していないか、文字が切れていないか、
 * 固定のバーに隠れて読めなくなっていないかを確認する。
 */

const USER = "layout@example.com";
let itemId = "";
let threadId = "";

const WIDTHS = [320, 375, 768, 1280];

test.beforeAll(async () => {
  const userId = await ensureUser(USER, "レイアウト確認");

  const db = adminDb();
  const { data: item } = await db
    .from("listings")
    .select("id")
    .eq("status", "published")
    .limit(1)
    .maybeSingle();
  itemId = item?.id ?? "";

  // やりとりの画面も見たいので、1本だけ用意する
  if (itemId) {
    const { data: existing } = await db
      .from("threads")
      .select("id")
      .eq("buyer_id", userId)
      .limit(1)
      .maybeSingle();
    threadId = existing?.id ?? "";
  }
});

function pagesToCheck(): string[] {
  const paths = [
    "/",
    "/search",
    "/search?q=Trek&category=road&price_max=200000",
    "/search?q=" + encodeURIComponent("該当しないことば"),
    "/login",
    "/signup",
    "/reset-password",
    "/terms",
    "/privacy",
    "/tokushoho",
    "/mypage",
    "/mypage/listings",
    "/mypage/purchases",
    "/mypage/sales",
    "/mypage/favorites",
    "/mypage/profile",
    "/mypage/settings",
    "/messages",
    "/sell",
  ];
  if (itemId) paths.push(`/items/${itemId}`, `/items/${itemId}/purchase`);
  if (threadId) paths.push(`/messages/${threadId}`);
  return paths;
}

/** 横のはみ出しと、文字の切れを拾う */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      found.push(`横スクロール(+${doc.scrollWidth - doc.clientWidth}px)`);
    }

    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (element.children.length > 0) continue;
      const text = element.textContent?.trim();
      if (!text) continue;

      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;

      // 横スクロールさせる入れ物の中は、はみ出していてよい
      let inScroller = false;
      for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          inScroller = true;
          break;
        }
      }
      if (inScroller) continue;

      if (box.right > window.innerWidth + 1 && style.position !== "fixed") {
        found.push(`右へはみ出し「${text.slice(0, 20)}」`);
      }

      // 省略記号も折り返しも指定せずに、横方向で切れている
      const clipped = element.scrollWidth > element.clientWidth + 2 && style.overflowX === "hidden";
      const handled = style.textOverflow === "ellipsis" || style.whiteSpace.includes("nowrap");
      if (clipped && !handled) {
        found.push(`横に切れている「${text.slice(0, 20)}」`);
      }
    }

    return [...new Set(found)].slice(0, 5);
  });
}

for (const width of WIDTHS) {
  test(`${width}px で画面が崩れない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, USER);

    const problems: string[] = [];
    for (const path of pagesToCheck()) {
      const response = await page.goto(path, { waitUntil: "networkidle" });
      if (!response || response.status() >= 400) {
        // 権限や状態で開けない画面はこの検査の対象外
        continue;
      }
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
      for (const problem of await layoutProblems(page)) {
        problems.push(`${path} @${width}px: ${problem}`);
      }
    }

    expect(problems.join("\n")).toBe("");
  });
}

test("下部の固定バーが本文を隠さない", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, USER);

  const hidden: string[] = [];
  for (const path of ["/", "/search", "/mypage", "/mypage/settings"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const overlapped = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>('nav[aria-label="メインナビゲーション"]');
      if (!bar) return [];
      const barTop = bar.getBoundingClientRect().top;

      return [...document.querySelectorAll<HTMLElement>("main a[href], main button, main p")]
        .filter((element) => {
          const box = element.getBoundingClientRect();
          if (box.height === 0 || box.width === 0) return false;
          if (!(element.textContent ?? "").trim()) return false;
          // 画面内にあるのに、下部バーの下へ潜り込んでいる
          return box.top < barTop && box.bottom > barTop + 4 && box.top > 0;
        })
        .map((element) => (element.textContent ?? "").trim().slice(0, 20));
    });

    if (overlapped.length > 0) hidden.push(`${path}: ${overlapped.join(", ")}`);
  }

  expect(hidden.join("\n")).toBe("");
});
