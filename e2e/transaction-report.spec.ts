import { test, expect } from "@playwright/test";
import { adminDb, ensureUser, login, passReportWindow, runDailyBatch, userDb } from "./helpers";

/**
 * 利用規約で「サイト上にある」としているものが、実際にあること。
 *
 * - 第7条2: 売買契約の成立時点を、購入手続きの画面で示す
 * - 第11条2・第14条: 取引の問題を、取引画面から運営へ申告できる
 * - 第21条2: 問い合わせ窓口のページがある
 */

const STAMP = Date.now();
const SELLER = "txreport-seller@example.com";
const BUYER = "txreport-buyer@example.com";
const OUTSIDER = "txreport-outsider@example.com";
const ADMIN = "txreport-admin@example.com";
const TITLE = `申告を確かめる取引 ${STAMP}`;

test.describe.configure({ mode: "serial" });

let adminId = "";
let listingId = "";
let txId = "";

test.beforeAll(async () => {
  const db = adminDb();
  const sellerId = await ensureUser(SELLER, "申告される出品者");
  await ensureUser(BUYER, "申告する購入者");
  await ensureUser(OUTSIDER, "取引と無関係の会員");
  adminId = await ensureUser(ADMIN, "申告を受ける運営");
  await db.from("users").update({ role: "admin" }).eq("id", adminId);

  const { data: brand } = await db.from("brands").select("id").eq("name", "Trek").maybeSingle();
  const { data } = await db
    .from("listings")
    .insert({
      seller_id: sellerId,
      title: TITLE,
      description: "取引の申告を確かめるための出品です。",
      category: "road",
      brand_id: brand?.id ?? null,
      condition: "good",
      price: 41000,
      delivery_method: "shipping",
      shipping_from_pref: "13",
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  listingId = data!.id;
});

test.afterAll(async () => {
  const db = adminDb();
  if (txId) {
    await db.from("reports").delete().eq("target_id", txId);
    await db.from("reviews").delete().eq("transaction_id", txId);
    await db.from("email_logs").delete().eq("ref_id", txId);
    await db.from("transaction_events").delete().eq("transaction_id", txId);
  }
  await db.from("transactions").delete().eq("listing_id", listingId);
  await db.from("threads").delete().eq("listing_id", listingId);
  await db.from("listings").delete().eq("id", listingId);
});

test("購入手続きの画面で、売買契約がいつ成立するかがわかる", async ({ page }) => {
  await login(page, BUYER);
  await page.goto(`/items/${listingId}/purchase`);
  await expect(
    page.getByText("お支払いが完了した時点で、出品者との売買契約が成立します。"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "利用規約" }).first()).toHaveAttribute(
    "href",
    "/terms",
  );

  await page.getByRole("button", { name: /を支払う/ }).click();
  await expect(page).toHaveURL(/\/purchase\/demo/, { timeout: 30_000 });
  await page.getByRole("button", { name: /を支払う\(デモ\)/ }).click();
  await expect(page).toHaveURL(/\/purchase\/complete/, { timeout: 30_000 });
  await expect(page.getByText("出品者との売買契約が成立しました")).toBeVisible({
    timeout: 30_000,
  });

  const { data } = await adminDb()
    .from("transactions")
    .select("id")
    .eq("listing_id", listingId)
    .single();
  txId = data!.id;
});

test("購入者は取引画面から取引の問題を申告でき、運営に知らせが届く", async ({ page }) => {
  await login(page, BUYER);
  await page.goto(`/transactions/${txId}`);
  await expect(page.getByRole("heading", { name: "取引で問題があったとき" })).toBeVisible();

  await page.getByRole("button", { name: "取引の問題を運営に申告する" }).click();
  const dialog = page.getByRole("dialog");
  // 発送前なので、合意によるキャンセルも選べる
  await expect(dialog.getByRole("radio")).toHaveCount(6);
  await expect(dialog.getByLabel("発送前のキャンセル(相手と合意済み)")).toBeVisible();
  await dialog.getByLabel("商品が届かない・受け渡しされない").click();
  await dialog.locator("textarea").fill("発送の連絡から1週間たっても届きません。");
  await dialog.getByRole("button", { name: "申告する" }).click();
  await expect(page.getByText("申告を受け付けました")).toBeVisible({ timeout: 20_000 });

  const { data: reports } = await adminDb()
    .from("reports")
    .select("target_type, reason, detail, status")
    .eq("target_id", txId);
  expect(reports).toEqual([
    {
      target_type: "transaction",
      reason: "not_received",
      detail: "発送の連絡から1週間たっても届きません。",
      status: "open",
    },
  ]);

  // 運営あての知らせが出ている(返金や発送の期限に関わるため)
  await expect
    .poll(
      async () => {
        const { data } = await adminDb()
          .from("email_logs")
          .select("user_id")
          .eq("kind", "admin_tx_report")
          .eq("ref_id", txId);
        return (data ?? []).map((row) => row.user_id);
      },
      { timeout: 20_000 },
    )
    .toContain(adminId);

  // 運営の確認中は、同じ取引を重ねて申告できない
  await page.getByRole("button", { name: "取引の問題を運営に申告する" }).click();
  await dialog.getByLabel("その他").click();
  await dialog.getByRole("button", { name: "申告する" }).click();
  await expect(dialog.getByText("この取引の申告は運営で確認中です")).toBeVisible({
    timeout: 20_000,
  });
});

test("運営は申告を通報管理で見つけ、取引の詳細とメッセージへ進める", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/admin/reports?target_type=transaction");
  const card = page.locator("li", { hasText: `${TITLE} の取引` });
  await expect(card.getByText("取引", { exact: true })).toBeVisible();
  await expect(card.getByText("商品が届かない・受け渡しされない")).toBeVisible();

  await card.getByRole("link", { name: "取引の詳細・メッセージを開く" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/transactions/${txId}`), { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "当事者からの申告" })).toBeVisible();
  await expect(page.getByText("発送の連絡から1週間たっても届きません。")).toBeVisible();
});

test("申告が未対応のあいだは、評価がそろって期間が過ぎても取引を完了させない", async ({ page }) => {
  // 受け取り・相互評価が済み、受取確認から3日が過ぎた状態にする
  const db = adminDb();
  const { data: tx } = await db
    .from("transactions")
    .select("buyer_id, seller_id")
    .eq("id", txId)
    .single();
  await db
    .from("transactions")
    .update({ status: "received", shipped_at: new Date().toISOString() })
    .eq("id", txId);
  await passReportWindow(txId);
  await db.from("reviews").insert([
    { transaction_id: txId, reviewer_id: tx!.buyer_id, reviewee_id: tx!.seller_id, rating: 2 },
    { transaction_id: txId, reviewer_id: tx!.seller_id, reviewee_id: tx!.buyer_id, rating: 4 },
  ]);

  await runDailyBatch(page.request);
  const status = async () =>
    (await db.from("transactions").select("status").eq("id", txId).single()).data?.status;
  expect(await status()).toBe("received");

  // 運営が対応済みにすると、次の日次バッチで完了する
  await db
    .from("reports")
    .update({ status: "resolved" })
    .eq("target_id", txId)
    .eq("status", "open");
  await runDailyBatch(page.request);
  await expect.poll(status, { timeout: 20_000 }).toBe("completed");
});

test("購入者は受取確認から3日を過ぎると、取引画面から申告できない", async ({ page }) => {
  // 直前のテストで、受取確認は4日前になっている
  await login(page, BUYER);
  await page.goto(`/transactions/${txId}`);
  await expect(page.getByText("取引画面からの申告は締め切りました")).toBeVisible();
  await expect(page.getByRole("button", { name: "取引の問題を運営に申告する" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "お問い合わせ" }).first()).toBeVisible();

  // 出品者には期限が無い。発送後なので合意によるキャンセルは選べない
  await login(page, SELLER);
  await page.goto(`/transactions/${txId}`);
  await page.getByRole("button", { name: "取引の問題を運営に申告する" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio")).toHaveCount(5);
  await expect(dialog.getByLabel("発送前のキャンセル(相手と合意済み)")).toHaveCount(0);
});

test("取引と関係のない会員は、その取引を申告できない", async ({ page }) => {
  // 取引画面そのものが開けないので、申告の操作にたどり着けない
  await login(page, OUTSIDER);
  const response = await page.goto(`/transactions/${txId}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("button", { name: "取引の問題を運営に申告する" })).toHaveCount(0);

  // ブラウザと同じ鍵で直接書き込むこともできない(申告は運営側の処理からのみ入る)
  const outsider = await userDb(OUTSIDER);
  const { data: me } = await outsider.auth.getUser();
  const { error } = await outsider.from("reports").insert({
    reporter_id: me.user!.id,
    target_type: "transaction",
    target_id: txId,
    reason: "other",
  });
  expect(error?.code).toBe("42501");
});

test("取引ルールと特商法表記がフッターから開け、甲の決めた条件が載っている", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "取引ルール" }).click();
  await expect(page).toHaveURL(/\/rules$/);
  for (const text of [
    "商品が届かない場合",
    "購入者の都合による返品・キャンセルは、原則としてお受けできません",
    "商品を受け取ってから3日以内",
    "商品代金の全額を返金します",
    "出品者に販売手数料(商品代金の7%)はかかりません",
    "決済手数料は、原則として運営が負担します",
    "商品代金の決済は必ずサイト内で行ってください",
  ]) {
    await expect(page.getByText(text, { exact: false }).first(), text).toBeVisible();
  }

  await page.goto("/tokushoho");
  await expect(page.getByText("ダミー")).toHaveCount(0);
  await expect(page.getByText("鈴木財恩").first()).toBeVisible();
  await expect(page.getByText("bicyclemarket.support@gmail.com")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("お問い合わせの窓口がフッターから開け、申告と通報の方法がわかる", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "お問い合わせ" }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole("heading", { name: "取引で問題があったとき" })).toBeVisible();
  await expect(page.getByText("「取引の問題を運営に申告する」")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "問題のある商品・利用者を見つけたとき" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "その他のお問い合わせ" })).toBeVisible();
  await expect(page.getByRole("link", { name: "bicyclemarket.support@gmail.com" })).toHaveAttribute(
    "href",
    "mailto:bicyclemarket.support@gmail.com",
  );
});
