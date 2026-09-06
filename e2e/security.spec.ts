import { test, expect } from "@playwright/test";
import { adminDb, ensureUser, login, userDb, TEST_PASSWORD } from "./helpers";

/**
 * セキュリティ観点の確認。
 *
 * 画面の出し分けだけに頼っていないか(サーバー側でも止まるか)、
 * 他人のデータに届かないか、入力した文字列がそのまま実行されないかを見る。
 */

const STAMP = Date.now();
const OWNER = "sec-owner@example.com";
const OTHER = "sec-other@example.com";

let ownerId = "";
let otherId = "";
let otherListingId = "";
let ownListingId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  ownerId = await ensureUser(OWNER, "セキュリティ確認A");
  otherId = await ensureUser(OTHER, "セキュリティ確認B");

  const db = adminDb();
  const base = {
    description: "セキュリティ確認用の出品です。",
    category: "road",
    condition: "good",
    delivery_method: "shipping",
    shipping_from_pref: "13",
    status: "published",
    published_at: new Date().toISOString(),
  };

  const { data: mine } = await db
    .from("listings")
    .insert({ ...base, seller_id: ownerId, title: `自分の出品 ${STAMP}`, price: 61000 })
    .select("id")
    .single();
  ownListingId = mine!.id;

  const { data: theirs } = await db
    .from("listings")
    .insert({ ...base, seller_id: otherId, title: `他人の出品 ${STAMP}`, price: 62000 })
    .select("id")
    .single();
  otherListingId = theirs!.id;
});

test.afterAll(async () => {
  const db = adminDb();
  const ids = [ownListingId, otherListingId].filter(Boolean);
  await db.from("transactions").delete().in("listing_id", ids);
  await db.from("threads").delete().in("listing_id", ids);
  await db.from("listings").delete().in("id", ids);
});

test("画面を通さず DB を触っても、他人のものは書き換えられない", async ({ page }) => {
  // ブラウザと同じ鍵・同じ権限で DB につなぐ
  const db = await userDb(OWNER);

  // 他人の出品の書き換え
  const { data: updated } = await db
    .from("listings")
    .update({ title: "乗っ取られたタイトル", price: 1 })
    .eq("id", otherListingId)
    .select("id");
  expect(updated ?? [], "他人の出品を更新できてはいけない").toEqual([]);

  // 他人の出品の削除
  const { data: deleted } = await db
    .from("listings")
    .delete()
    .eq("id", otherListingId)
    .select("id");
  expect(deleted ?? [], "他人の出品を削除できてはいけない").toEqual([]);

  // 他人になりすました出品
  const { error: insertError } = await db.from("listings").insert({
    seller_id: otherId,
    title: "なりすまし出品",
    description: "他人の名義で作れてはいけない",
    category: "road",
    condition: "good",
    price: 10000,
    delivery_method: "shipping",
    shipping_from_pref: "13",
    status: "published",
  });
  expect(insertError, "他人名義の出品を作れてはいけない").not.toBeNull();

  // 自分を管理者に昇格
  const { data: promoted } = await db
    .from("users")
    .update({ role: "admin" })
    .eq("id", ownerId)
    .select("id");
  expect(promoted ?? [], "自分で管理者になれてはいけない").toEqual([]);

  // 実データが無事であること
  const { data: listing } = await adminDb()
    .from("listings")
    .select("title, seller_id, price")
    .eq("id", otherListingId)
    .single();
  expect(listing?.seller_id).toBe(otherId);
  expect(listing?.title).toContain("他人の出品");

  const { data: me } = await adminDb().from("users").select("role").eq("id", ownerId).single();
  expect(me?.role).toBe("user");

  // 画面からも編集に入れない
  await login(page, OWNER);
  const editResponse = await page.goto(`/sell/${otherListingId}/edit`);
  expect(editResponse?.status()).toBe(404);
});

test("同じ接続で、自分の分は普通に読み書きできる", async () => {
  // 上の確認が「何をしても失敗する接続」で通っていないことを示す対照
  const db = await userDb(OWNER);

  const { data: mine } = await db
    .from("users")
    .update({ bio: `対照の確認 ${STAMP}` })
    .eq("id", ownerId)
    .select("id");
  expect(mine ?? [], "自分のプロフィールは更新できる").toHaveLength(1);

  const { data: listings } = await db.from("listings").select("id").eq("id", ownListingId);
  expect(listings ?? [], "公開中の出品は読める").toHaveLength(1);

  await adminDb().from("users").update({ bio: null }).eq("id", ownerId);
});

test("非公開の列はブラウザの鍵では読めない", async () => {
  const db = await userDb(OWNER);

  for (const column of ["email", "role", "notification_prefs", "suspended_reason"]) {
    const { error } = await db.from("users").select(column).limit(1);
    expect(error, `${column} が読めてはいけない`).not.toBeNull();
  }

  // 公開してよい列は読める
  const { data, error } = await db.from("users").select("id, display_name, prefecture").limit(1);
  expect(error).toBeNull();
  expect((data ?? []).length).toBeGreaterThan(0);
});

test("集計用の関数はブラウザの鍵から呼べない", async () => {
  // 未読数とスレッド一覧は、本人確認を済ませたサーバー側からしか呼べない。
  // 呼べてしまうと、他人の ID を渡して未読数や相手の名前を引ける。
  const db = await userDb(OWNER);

  for (const fn of ["unread_message_count", "thread_summaries"]) {
    const { error } = await db.rpc(fn as "unread_message_count", { target_user: otherId });
    expect(error, `${fn} が呼べてはいけない`).not.toBeNull();
  }

  // 対照。RLS の範囲で答える関数は呼べる
  const { error } = await db.rpc("listing_status_counts", { seller: ownerId });
  expect(error, "出品の件数は呼べる").toBeNull();
});

test("画面を通さず DB を読んでも、他人のやりとりは見えない", async () => {
  const db = adminDb();
  const { data: thread } = await db
    .from("threads")
    .insert({ listing_id: otherListingId, buyer_id: otherId })
    .select("id")
    .single();
  await db
    .from("messages")
    .insert({ thread_id: thread!.id, sender_id: otherId, body: "第三者に見えてはいけない本文" });

  const outsider = await userDb(OWNER);
  const { data: threads } = await outsider.from("threads").select("id").eq("id", thread!.id);
  expect(threads ?? [], "関係のないやりとり").toEqual([]);

  const { data: messages } = await outsider
    .from("messages")
    .select("body")
    .eq("thread_id", thread!.id);
  expect(messages ?? [], "関係のないメッセージ").toEqual([]);

  const { data: transactions } = await outsider
    .from("transactions")
    .select("id")
    .neq("buyer_id", ownerId);
  expect((transactions ?? []).length, "自分が当事者でない取引が読めてはいけない").toBe(0);

  await db.from("messages").delete().eq("thread_id", thread!.id);
  await db.from("threads").delete().eq("id", thread!.id);
});

test("他人の取引・やりとりの URL は 404 になる", async ({ page }) => {
  const db = adminDb();
  const { data: transaction } = await db
    .from("transactions")
    .insert({
      listing_id: otherListingId,
      seller_id: otherId,
      buyer_id: ownerId,
      status: "pending_payment",
      price: 62000,
    })
    .select("id")
    .single();

  // 当事者は開ける
  await login(page, OWNER);
  const mine = await page.goto(`/transactions/${transaction!.id}`);
  expect(mine?.status()).toBe(200);

  // 第三者は開けない
  const third = await ensureUser("sec-third@example.com", "セキュリティ確認C");
  expect(third).toBeTruthy();
  await login(page, "sec-third@example.com");
  const theirs = await page.goto(`/transactions/${transaction!.id}`);
  expect(theirs?.status()).toBe(404);

  await db.from("transactions").delete().eq("id", transaction!.id);
});

test("入力した文字列はそのまま実行されない", async ({ page }) => {
  const payload = `<img src=x onerror="window.__xss=1">スクリプト混入の確認 ${STAMP}`;

  await adminDb()
    .from("listings")
    .update({ title: payload, description: `${payload}\n説明にも入れる` })
    .eq("id", ownListingId);

  await page.goto(`/items/${ownListingId}`);

  // 文字として表示され、実行はされない
  await expect(page.getByRole("heading", { level: 1 })).toContainText("スクリプト混入の確認");
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();
  // 差し込まれた img 要素が生えていない
  expect(await page.locator('img[src="x"]').count()).toBe(0);

  // 検索結果でも同じ
  await page.goto(`/search?q=${encodeURIComponent("スクリプト混入の確認")}`);
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});

test("表示名やプロフィールに入れた文字列も実行されない", async ({ page }) => {
  await adminDb()
    .from("users")
    .update({
      display_name: `<script>window.__xss2=1</script>やまだ`,
      bio: `<img src=y onerror="window.__xss2=1">よろしくお願いします`,
    })
    .eq("id", ownerId);

  await page.goto(`/users/${ownerId}`);
  expect(
    await page.evaluate(() => (window as unknown as { __xss2?: number }).__xss2),
  ).toBeUndefined();
  expect(await page.locator('img[src="y"]').count()).toBe(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("やまだ");

  await adminDb()
    .from("users")
    .update({ display_name: "セキュリティ確認A", bio: null })
    .eq("id", ownerId);
});

test("外部サイトへ飛ばす next は無視される", async ({ page }) => {
  for (const next of [
    "https://example.com/evil",
    "//example.com/evil",
    "/\\example.com",
    "javascript:alert(1)",
  ]) {
    await page.context().clearCookies();
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await page.fill("#email", OWNER);
    await page.fill("#password", TEST_PASSWORD);
    await page.click('button[type="submit"]:has-text("ログイン")');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
    expect(page.url(), next).toContain("localhost:3000");
  }
});

test("管理画面は一般会員から見えない", async ({ page }) => {
  await login(page, OWNER);
  for (const path of [
    "/admin",
    "/admin/users",
    "/admin/listings",
    "/admin/transactions",
    "/admin/reports",
    "/admin/brands",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test("ログインしていない状態では会員の情報が返らない", async ({ page }) => {
  await page.context().clearCookies();

  for (const path of ["/mypage", "/messages", "/mypage/settings", "/mypage/listings"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login/);
    // 中身が先に流れていないこと
    await expect(page.locator("body")).not.toContainText("セキュリティ確認A");
  }
});

test("秘密の鍵がブラウザへ出ていない", async ({ page }) => {
  const response = await page.goto("/");
  const html = (await response?.text()) ?? "";
  expect(html).not.toContain("service_role");
  expect(html).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  expect(html).not.toMatch(/sk_(live|test)_/);
  expect(html).not.toMatch(/whsec_/);
});
