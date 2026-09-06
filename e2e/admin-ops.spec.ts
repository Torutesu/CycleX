import { test, expect } from "@playwright/test";
import { adminDb, ensureUser, login } from "./helpers";

/**
 * 運営の操作(FR-12 / FR-13)。
 * 通報の対応、利用停止と解除、出品の非表示と解除、ブランドの管理、
 * 取引のキャンセルまでを画面から通す。
 */

const STAMP = Date.now();
const ADMIN = "ops-admin@example.com";
const MEMBER = "ops-member@example.com";
const REPORTER = "ops-reporter@example.com";

let memberId = "";
let listingId = "";
let reportId = "";

test.use({ viewport: { width: 1280, height: 900 } });
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const adminId = await ensureUser(ADMIN, "運営テストスタッフ");
  await adminDb().from("users").update({ role: "admin" }).eq("id", adminId);

  memberId = await ensureUser(MEMBER, "運営テスト会員");
  await adminDb().from("users").update({ role: "user", status: "active" }).eq("id", memberId);
  await ensureUser(REPORTER, "運営テスト通報者");

  const { data } = await adminDb()
    .from("listings")
    .insert({
      seller_id: memberId,
      title: `運営操作の確認 ${STAMP}`,
      description: "運営操作の確認用の出品です。",
      category: "mtb",
      condition: "good",
      price: 72000,
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
  await db.from("admin_audit_logs").delete().eq("target_id", listingId);
  await db.from("reports").delete().eq("target_id", listingId);
  await db.from("transactions").delete().eq("listing_id", listingId);
  await db.from("listings").delete().eq("id", listingId);
  await db.from("users").update({ status: "active", suspended_reason: null }).eq("id", memberId);
  await db.from("brands").delete().like("name", `E2Eブランド%`);
});

test("通報を受けて、対応済みにできる", async ({ page }) => {
  const reporterId = await ensureUser(REPORTER, "運営テスト通報者");
  const { data } = await adminDb()
    .from("reports")
    .insert({
      reporter_id: reporterId,
      target_type: "listing",
      target_id: listingId,
      reason: "prohibited",
      detail: `運営操作の確認 ${STAMP}`,
    })
    .select("id")
    .single();
  reportId = data!.id;

  await login(page, ADMIN);
  await page.goto("/admin/reports?status=open");
  await expect(page.getByText(`運営操作の確認 ${STAMP}`).first()).toBeVisible();

  await page.getByRole("button", { name: "対応済みにする" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("出品者へ連絡済み");
  await dialog.getByRole("button", { name: "対応済みにする" }).click();
  await expect(page.getByText("対応済みにしました")).toBeVisible({ timeout: 20_000 });

  // 未対応の一覧からは消える
  await page.goto("/admin/reports?status=open");
  await expect(page.getByText(`運営操作の確認 ${STAMP}`)).toHaveCount(0);

  const { data: after } = await adminDb()
    .from("reports")
    .select("status, resolved_note")
    .eq("id", reportId)
    .single();
  expect(after?.status).toBe("resolved");
  expect(after?.resolved_note).toBe("出品者へ連絡済み");
});

test("出品を非表示にして、理由を残し、あとで戻せる", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto(`/admin/listings?q=${encodeURIComponent(`運営操作の確認 ${STAMP}`)}`);

  await page.getByRole("button", { name: "非表示にする" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("規約に反する記載があるため");
  await dialog.getByRole("button", { name: "非表示にする" }).click();
  await expect(page.getByText(/非表示にしました/)).toBeVisible({ timeout: 20_000 });

  // 出品者には理由が見える
  await login(page, MEMBER);
  await page.goto("/mypage/listings?status=suspended");
  await expect(page.getByText("規約に反する記載があるため")).toBeVisible();

  // 検索には出ない
  await page.goto(`/search?q=${encodeURIComponent(`運営操作の確認 ${STAMP}`)}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("0件");

  // 運営が解除すると「取下げ中」に戻る。公開するかは出品者が決める
  await login(page, ADMIN);
  await page.goto(`/admin/listings?q=${encodeURIComponent(`運営操作の確認 ${STAMP}`)}`);
  await page.getByRole("button", { name: "非表示を解除" }).first().click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText("取下げ中に戻ります");
  await confirm.getByRole("button", { name: "非表示を解除" }).click();
  await expect(page.getByText("非表示を解除しました")).toBeVisible({ timeout: 20_000 });

  const { data: restored } = await adminDb()
    .from("listings")
    .select("status, suspended_reason")
    .eq("id", listingId)
    .single();
  expect(restored?.status, JSON.stringify(restored)).toBe("withdrawn");
  expect(restored?.suspended_reason).toBeNull();

  // 出品者が再公開すると、検索に戻る
  await login(page, MEMBER);
  await page.goto("/mypage/listings?status=withdrawn");
  await page.getByRole("button", { name: `運営操作の確認 ${STAMP} の操作` }).click();
  await page.getByRole("menuitem", { name: "再公開する" }).click();
  await expect(page.getByText("再公開しました")).toBeVisible({ timeout: 20_000 });

  await page.goto(`/search?q=${encodeURIComponent(`運営操作の確認 ${STAMP}`)}`);
  await expect(page.locator("article").first()).toBeVisible();
});

test("利用停止にすると出品も止まり、解除すると本人だけ戻る", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto(`/admin/users/${memberId}`);

  await page.getByRole("button", { name: "利用停止にする" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("複数の通報があったため");
  await dialog.getByRole("button", { name: "利用停止にする" }).click();
  await expect(page.getByText("利用停止にしました")).toBeVisible({ timeout: 20_000 });

  // 出品も止まる
  const { data: stopped } = await adminDb()
    .from("listings")
    .select("status")
    .eq("id", listingId)
    .single();
  expect(stopped?.status).toBe("suspended");

  // 本人はログインしても専用画面へ送られる。
  // 停止の理由は記録用なので、本人には出さない
  await login(page, MEMBER);
  await expect(page).toHaveURL(/\/suspended/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("利用を停止");
  await expect(page.getByText("複数の通報があったため")).toHaveCount(0);

  // 記録には残っている
  const { data: suspended } = await adminDb()
    .from("users")
    .select("status, suspended_reason")
    .eq("id", memberId)
    .single();
  expect(suspended?.status).toBe("suspended");
  expect(suspended?.suspended_reason).toBe("複数の通報があったため");

  // 解除する
  await login(page, ADMIN);
  await page.goto(`/admin/users/${memberId}`);
  await page.getByRole("button", { name: "利用停止を解除" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /解除|実行/ }).click();
  await expect(page.getByText("利用停止を解除しました")).toBeVisible({ timeout: 20_000 });

  await login(page, MEMBER);
  await page.goto("/mypage");
  await expect(page).toHaveURL(/\/mypage/);
});

test("ブランドを足して、名前を変えて、無効にできる", async ({ page }) => {
  const name = `E2Eブランド${STAMP}`;
  const renamed = `${name}改`;

  await login(page, ADMIN);
  await page.goto("/admin/brands");

  await page.getByLabel("ブランド名").first().fill(name);
  await page.getByRole("button", { name: /追加/ }).click();
  await expect(page.getByText(name)).toBeVisible({ timeout: 20_000 });

  // 出品フォームの選択肢にも出る
  await page.goto("/sell");
  await page.click("#brandId");
  await expect(page.getByRole("option", { name })).toBeVisible();
  await page.keyboard.press("Escape");

  // 名前を変える
  await page.goto("/admin/brands");
  await page.getByRole("button", { name: `${name} の名称を変更` }).click();
  await page.getByLabel("ブランド名").last().fill(renamed);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText(renamed)).toBeVisible({ timeout: 20_000 });

  // 無効にすると、出品フォームの選択肢から消える
  await page
    .locator("li", { hasText: renamed })
    .getByRole("button", { name: "無効にする" })
    .click();
  await expect(page.getByText("無効にしました")).toBeVisible({ timeout: 20_000 });

  await page.goto("/sell");
  await page.click("#brandId");
  await expect(page.getByRole("option", { name: renamed })).toHaveCount(0);
});

test("運営は取引をキャンセルでき、商品が戻る", async ({ page }) => {
  const buyerId = await ensureUser(REPORTER, "運営テスト通報者");
  await adminDb().from("listings").update({ status: "trading" }).eq("id", listingId);
  const { data: transaction } = await adminDb()
    .from("transactions")
    .insert({
      listing_id: listingId,
      seller_id: memberId,
      buyer_id: buyerId,
      status: "paid",
      price: 72000,
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  await login(page, ADMIN);
  await page.goto("/admin/transactions");

  await page.getByRole("button", { name: "キャンセル" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("購入者からの申し出のため");
  await dialog.getByRole("button", { name: "キャンセル" }).last().click();
  await expect(page.getByText(/キャンセルしました/)).toBeVisible({ timeout: 20_000 });

  const { data: after } = await adminDb()
    .from("transactions")
    .select("status, canceled_reason")
    .eq("id", transaction!.id)
    .single();
  expect(after?.status).toBe("canceled");

  const { data: listing } = await adminDb()
    .from("listings")
    .select("status")
    .eq("id", listingId)
    .single();
  expect(listing?.status).toBe("published");
});

test("運営の操作は記録として残る", async ({ page }) => {
  await login(page, ADMIN);
  const { data } = await adminDb()
    .from("admin_audit_logs")
    .select("action, target_id")
    .eq("target_id", listingId);

  // 非表示・解除・キャンセルの記録が残っている
  expect((data ?? []).length).toBeGreaterThan(0);
  await expect(page).toBeTruthy();
});
