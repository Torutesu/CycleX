import { test, expect } from "@playwright/test";
import { adminDb, ensureUser, login } from "./helpers";

// 管理画面は PC 前提の表なので、その幅で確認する
test.use({ viewport: { width: 1280, height: 900 } });

/**
 * 管理画面と権限(FR-12 / FR-13)。
 * 一般会員から管理画面が見えないこと、非表示化と利用停止が効くことを確認する。
 */

const ADMIN = "adm-admin@example.com";
const MEMBER = "adm-member@example.com";
const TITLE = `管理テスト出品 ${Date.now()}`;

let memberId = "";
let listingId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const adminId = await ensureUser(ADMIN, "管理テストスタッフ");
  await adminDb().from("users").update({ role: "admin" }).eq("id", adminId);

  memberId = await ensureUser(MEMBER, "管理テスト会員");
  await adminDb().from("users").update({ role: "user", status: "active" }).eq("id", memberId);

  const { data } = await adminDb()
    .from("listings")
    .insert({
      seller_id: memberId,
      title: TITLE,
      description: "管理操作の確認用の出品です。",
      category: "mtb",
      condition: "good",
      price: 71000,
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
  await db.from("listings").delete().eq("id", listingId);
  await db.from("users").update({ status: "active" }).eq("id", memberId);
});

test("一般会員には管理画面が存在しないように見える", async ({ page }) => {
  await login(page, MEMBER);

  for (const path of ["/admin", "/admin/users", "/admin/listings", "/admin/reports"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test("管理者は出品を非表示にでき、出品者には理由が見える", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto(`/admin/listings?q=${encodeURIComponent(TITLE)}`);
  const row = page.locator("tr", { hasText: TITLE });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "非表示にする" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill("防犯登録の確認が取れないため");
  await dialog.getByRole("button", { name: "非表示にする" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // 反映を DB でも確かめてから、来訪者としての見え方を見る
  await expect
    .poll(async () => {
      const { data } = await adminDb()
        .from("listings")
        .select("status, suspended_reason")
        .eq("id", listingId)
        .single();
      return `${data?.status}:${data?.suspended_reason}`;
    })
    .toBe("suspended:防犯登録の確認が取れないため");

  // --- 来訪者からは見えなくなる ---
  await page.context().clearCookies();
  const response = await page.goto(`/items/${listingId}`);
  expect(response?.status()).toBe(404);

  // --- 出品者には理由つきで見える ---
  await login(page, MEMBER);
  await page.goto("/mypage/listings");
  // 既定の「公開中」からは外れ、「非公開」の件数が立つ
  await expect(page.getByRole("link", { name: "非公開 1" })).toBeVisible();
  await page.goto("/mypage/listings?status=suspended");
  await expect(page.getByText(TITLE)).toBeVisible();
  await expect(page.getByText("防犯登録の確認が取れないため")).toBeVisible();
});

test("利用停止にすると本人はログインしても専用画面へ送られる", async ({ page }) => {
  await adminDb().from("users").update({ status: "suspended" }).eq("id", memberId);

  await login(page, MEMBER);
  await expect(page).toHaveURL(/\/suspended/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("アカウントの利用を停止しています");

  // 会員向けの画面には入れない
  await page.goto("/sell");
  await expect(page).toHaveURL(/\/suspended|\/login/);

  await adminDb().from("users").update({ status: "active" }).eq("id", memberId);
});
