import { test, expect, type Page } from "@playwright/test";
import { adminDb, ensureUser, login } from "./helpers";

/**
 * 対面(手渡し)の取引。
 *
 * 手渡しでも支払いはサイト内で済ませ、手数料が確実に入ることを確かめる。
 * 先方から「手渡しを認めつつ、決済はサイト内で完結できるか」「現地で確認してから
 * 完了する場合の決済・受取確認・キャンセルは今の仕様で回るか」と聞かれたときの裏付け。
 *
 * 1. 先に支払い、会って受け渡す(サイトの標準の流れ)
 * 2. 先に質問で待ち合わせを決め、現地で確認してから、その場で購入する
 * 3. 現地でやめた場合は、運営がキャンセルして返金の対応に回る
 */

const STAMP = Date.now();
const SELLER = "hand-seller@example.com";
const BUYER = "hand-buyer@example.com";
const ADMIN = "hand-admin@example.com";

test.describe.configure({ mode: "serial" });

let sellerId = "";
const listingIds: string[] = [];

test.beforeAll(async () => {
  sellerId = await ensureUser(SELLER, "手渡し出品者");
  await ensureUser(BUYER, "手渡し購入者");
  const adminId = await ensureUser(ADMIN, "手渡し確認の運営");
  await adminDb().from("users").update({ role: "admin" }).eq("id", adminId);
});

test.afterAll(async () => {
  const db = adminDb();
  if (listingIds.length === 0) return;
  await db.from("transactions").delete().in("listing_id", listingIds);
  await db.from("threads").delete().in("listing_id", listingIds);
  await db.from("listings").delete().in("id", listingIds);
});

/** 手渡しの商品を直接用意する(画面からの出品は別のテストで確かめている) */
async function handOverListing(title: string, price: number): Promise<string> {
  const db = adminDb();
  const { data: brand } = await db.from("brands").select("id").eq("name", "Trek").maybeSingle();
  const { data } = await db
    .from("listings")
    .insert({
      seller_id: sellerId,
      title,
      description: "手渡しの取引を確認するための出品です。",
      category: "road",
      brand_id: brand?.id ?? null,
      condition: "good",
      price,
      delivery_method: "in_person",
      meetup_pref: "13",
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  listingIds.push(data!.id);
  return data!.id;
}

/** 購入者として、商品ページから支払いまで進める(デモ決済) */
async function buy(page: Page, listingId: string): Promise<string> {
  await page.goto(`/items/${listingId}`);
  await page.getByRole("link", { name: "購入手続きへ" }).first().click();
  await page.getByRole("button", { name: /を支払う/ }).click();
  await expect(page).toHaveURL(/\/purchase\/demo/, { timeout: 30_000 });
  await page.getByRole("button", { name: /を支払う\(デモ\)/ }).click();
  await expect(page).toHaveURL(/\/purchase\/complete/, { timeout: 30_000 });

  const { data } = await adminDb()
    .from("transactions")
    .select("id")
    .eq("listing_id", listingId)
    .single();
  return `/transactions/${data!.id}`;
}

test("先に支払い、会って受け渡す", async ({ page }) => {
  const title = `手渡し・先払い ${STAMP}`;
  const listingId = await handOverListing(title, 52000);

  // 商品ページでは、発送元ではなく受渡地域として出る
  await page.goto(`/items/${listingId}`);
  await expect(page.getByText("受渡地域").first()).toBeVisible();

  await login(page, BUYER);
  const txPath = await buy(page, listingId);

  // 購入者には、住所ではなく待ち合わせを相談する案内が出る
  await page.goto(txPath);
  await expect(
    page.getByRole("heading", { name: "受渡の日時と場所をご相談ください" }),
  ).toBeVisible();
  await expect(page.getByText("お届け先をお伝えください")).toHaveCount(0);

  // 出品者には、支払いが済んでいることと、受渡の連絡をする操作が出る
  await login(page, SELLER);
  await page.goto(txPath);
  await expect(page.getByRole("heading", { name: "受渡の連絡をしてください" })).toBeVisible();
  await expect(page.getByText("お支払いが完了しています").first()).toBeVisible();
  await page.fill("#shipping-note", "10/20 15時、新宿駅南口でお渡ししました。");
  await page.getByRole("button", { name: "受渡の連絡をする" }).click();
  await expect(page.getByRole("heading", { name: "購入者の受取確認をお待ちください" })).toBeVisible(
    {
      timeout: 20_000,
    },
  );

  // 購入者が現地で確かめてから受取確認する
  await login(page, BUYER);
  await page.goto(txPath);
  await expect(page.getByText("新宿駅南口でお渡ししました")).toBeVisible();
  await page.getByRole("button", { name: "受け取りました" }).click();
  await page.getByRole("button", { name: "受取を確認する" }).click();
  await expect(page.getByRole("heading", { name: "取引相手を評価してください" })).toBeVisible({
    timeout: 20_000,
  });

  // サイト内で支払った取引として残る(=手数料の対象)
  const { data } = await adminDb()
    .from("transactions")
    .select("status, price, paid_at")
    .eq("listing_id", listingId)
    .single();
  expect(data?.status).toBe("received");
  expect(data?.price).toBe(52000);
  expect(data?.paid_at).not.toBeNull();
});

test("会う前に質問で待ち合わせを決め、現地で確認してから、その場で購入する", async ({ page }) => {
  const title = `手渡し・現地購入 ${STAMP}`;
  const listingId = await handOverListing(title, 64000);

  // 購入前でも、出品者に質問して待ち合わせを決められる
  await login(page, BUYER);
  await page.goto(`/items/${listingId}`);
  await page.getByRole("button", { name: "出品者に質問" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("現物を見てから購入したいです。週末に新宿で見られますか。");
  await dialog.getByRole("button", { name: "送信する" }).click();
  await expect(page).toHaveURL(/\/messages\//, { timeout: 20_000 });

  // 会うまでの間、商品は他の人にも購入できるまま(取り置きの仕組みは無い)
  {
    const { data } = await adminDb().from("listings").select("status").eq("id", listingId).single();
    expect(data?.status).toBe("published");
  }

  // 現地で確認して、その場で購入する
  const txPath = await buy(page, listingId);

  // 出品者は、自分の画面で支払い済みになったことを確かめてから渡せる
  await login(page, SELLER);
  await page.goto(txPath);
  await expect(page.getByRole("heading", { name: "受渡の連絡をしてください" })).toBeVisible();
  await expect(page.getByText("お支払いが完了しています").first()).toBeVisible();
});

test("現地でやめた場合、当事者は取り消せず、運営のキャンセルと返金対応に回る", async ({ page }) => {
  const title = `手渡し・現地で中止 ${STAMP}`;
  const listingId = await handOverListing(title, 38000);

  await login(page, BUYER);
  const txPath = await buy(page, listingId);

  // 購入者・出品者の画面には、取引を取り消す操作が無い
  await page.goto(txPath);
  await expect(page.getByRole("button", { name: /キャンセル|取り消/ })).toHaveCount(0);
  await login(page, SELLER);
  await page.goto(txPath);
  await expect(page.getByRole("button", { name: /キャンセル|取り消/ })).toHaveCount(0);

  // 運営がキャンセルすると商品は購入できる状態に戻り、返金対応が必要な取引として残る
  await login(page, ADMIN);
  await page.goto("/admin/transactions");
  await page.locator("tr", { hasText: title }).getByRole("button", { name: "キャンセル" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("現地で確認した結果、購入を見送り");
  await dialog.getByRole("button", { name: "キャンセル" }).last().click();
  await expect(page.getByText(/キャンセルしました/)).toBeVisible({ timeout: 20_000 });

  await expect
    .poll(
      async () => {
        const { data } = await adminDb()
          .from("transactions")
          .select("status, paid_at")
          .eq("listing_id", listingId)
          .single();
        return data?.status;
      },
      { timeout: 20_000 },
    )
    .toBe("canceled");

  const { data: listing } = await adminDb()
    .from("listings")
    .select("status")
    .eq("id", listingId)
    .single();
  expect(listing?.status).toBe("published");

  // 入金済みのままキャンセルされた取引は、管理画面の「返金対応」に出る
  await page.goto("/admin/transactions?refund=pending");
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 });
});
