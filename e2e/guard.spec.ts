import { test, expect, type Page } from "@playwright/test";
import { adminDb, ensureUser, login } from "./helpers";

/**
 * 権限と異常系、そして画面サイズの確認。
 * 個別の機能ではなく「壊れていないこと」を横断で見るためのもの。
 */

const OWNER = "guard-owner@example.com";
const OTHER = "guard-other@example.com";

let ownerId = "";
let otherId = "";
let ownListingId = "";
let otherListingId = "";

test.describe.configure({ mode: "serial" });

async function makeListing(sellerId: string, title: string) {
  const { data } = await adminDb()
    .from("listings")
    .insert({
      seller_id: sellerId,
      title,
      description: "権限確認用の出品です。",
      category: "road",
      condition: "good",
      price: 42000,
      delivery_method: "shipping",
      shipping_from_pref: "13",
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return data!.id as string;
}

test.beforeAll(async () => {
  ownerId = await ensureUser(OWNER, "権限テスト本人");
  otherId = await ensureUser(OTHER, "権限テスト別人");
  ownListingId = await makeListing(ownerId, `権限テスト自分の出品 ${Date.now()}`);
  otherListingId = await makeListing(otherId, `権限テスト他人の出品 ${Date.now()}`);
});

test.afterAll(async () => {
  const db = adminDb();
  await db.from("transactions").delete().in("listing_id", [ownListingId, otherListingId]);
  await db.from("listings").delete().in("id", [ownListingId, otherListingId]);
});

test("他人のものには触れない", async ({ page }) => {
  await login(page, OWNER);

  const editResponse = await page.goto(`/sell/${otherListingId}/edit`);
  expect(editResponse?.status(), "他人の出品の編集").toBe(404);

  // 他人同士の取引・やりとりを用意して、当事者以外から開けないことを見る
  const { data: transaction } = await adminDb()
    .from("transactions")
    .insert({
      listing_id: otherListingId,
      seller_id: otherId,
      buyer_id: (await ensureUser("guard-buyer@example.com", "権限テスト購入者")) as string,
      status: "pending_payment",
      price: 42000,
    })
    .select("id")
    .single();

  const txResponse = await page.goto(`/transactions/${transaction!.id}`);
  expect(txResponse?.status(), "関係のない取引").toBe(404);

  const { data: thread } = await adminDb()
    .from("threads")
    .insert({
      listing_id: otherListingId,
      buyer_id: (await ensureUser("guard-buyer@example.com", "権限テスト購入者")) as string,
    })
    .select("id")
    .single();

  const threadResponse = await page.goto(`/messages/${thread!.id}`);
  expect(threadResponse?.status(), "関係のないやりとり").toBe(404);

  await adminDb().from("threads").delete().eq("id", thread!.id);
  await adminDb().from("transactions").delete().eq("id", transaction!.id);
});

test("自分の出品は買えない", async ({ page }) => {
  await login(page, OWNER);

  await page.goto(`/items/${ownListingId}`);
  await expect(page.getByRole("link", { name: "購入手続きへ" })).toHaveCount(0);

  // URL を直接叩いても購入手続きには入れない
  await page.goto(`/items/${ownListingId}/purchase`);
  await expect(page).toHaveURL(new RegExp(`/items/${ownListingId}$`));
});

test("URL をいじられても壊れない", async ({ page }) => {
  await page.goto("/search?price_min=abc&price_max=-5&page=999999&sort=evil&pref=99&category=zzz");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("さがす");

  const badId = await page.goto("/items/not-a-uuid");
  expect(badId?.status()).toBe(404);

  // 外部サイトへ飛ばすための next は無視される
  await login(page, OWNER);
  await page.goto("/login?next=https://example.com/evil");
  await expect(page).toHaveURL(/localhost|vercel\.app/);
});

async function widestOverflow(page: Page, paths: string[]) {
  const over: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    const diff = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (diff > 1) over.push(`${path}(+${diff}px)`);
  }
  return over;
}

for (const width of [320, 375, 768, 1280]) {
  test(`${width}px で横スクロールが出ない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, OWNER);
    const over = await widestOverflow(page, [
      "/",
      "/search",
      "/sell",
      "/mypage",
      "/mypage/listings",
      "/messages",
      `/items/${otherListingId}`,
    ]);
    expect(over.join(" ")).toBe("");
  });
}

test("押せる要素の高さが足りている", async ({ page }) => {
  await login(page, OWNER);
  const small: string[] = [];

  for (const path of ["/", "/search", "/mypage", "/sell"]) {
    await page.goto(path);
    const found = await page.evaluate(() =>
      [...document.querySelectorAll("a[href], button")]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.height < 32 &&
            (el.textContent ?? "").trim().length > 0
          );
        })
        .map(
          (el) =>
            `${(el.textContent ?? "").trim().slice(0, 14)}(${Math.round(el.getBoundingClientRect().height)}px)`,
        ),
    );
    if (found.length > 0) small.push(`${path}: ${found.join(", ")}`);
  }

  expect(small.join(" / ")).toBe("");
});
