import { test, expect } from "@playwright/test";
import { adminDb, ensureUser, login, TEST_PASSWORD } from "./helpers";
import { mailcatcherAvailable, waitForMail } from "./mail";

/**
 * アカウントの管理(FR-01 / FR-02)。
 * プロフィールの反映、パスワード変更、メールアドレス変更、通知設定、退会までを通す。
 *
 * 退会は元に戻せないので、専用の使い捨てユーザーで確認する。
 */

const STAMP = Date.now();
const PROFILE_USER = `acct-profile-${STAMP}@example.com`;
const PASSWORD_USER = `acct-password-${STAMP}@example.com`;
const EMAIL_USER = `acct-email-${STAMP}@example.com`;
const WITHDRAW_USER = `acct-withdraw-${STAMP}@example.com`;
const NEW_PASSWORD = "qwer5678";

let profileId = "";
let withdrawId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  profileId = await ensureUser(PROFILE_USER, "プロフィール確認");
  await ensureUser(PASSWORD_USER, "パスワード確認");
  await ensureUser(EMAIL_USER, "メール確認");
  withdrawId = await ensureUser(WITHDRAW_USER, "退会確認");
});

test.afterAll(async () => {
  const db = adminDb();
  const { data } = await db.from("listings").select("id").eq("seller_id", withdrawId);
  const ids = (data ?? []).map((row) => row.id);
  if (ids.length > 0) {
    await db.from("listing_images").delete().in("listing_id", ids);
    await db.from("listings").delete().in("id", ids);
  }
});

test("プロフィールの変更が公開ページに出る", async ({ page }) => {
  await login(page, PROFILE_USER);
  await page.goto("/mypage/profile");

  await page.fill("#displayName", "自転車すきの人");
  await page.fill("#bio", "週末はロングライドに出ています。丁寧なお取引を心がけます。");
  await page.click("#prefecture");
  await page.click('[role="option"]:has-text("大阪府")');
  await page.getByRole("button", { name: /保存|更新/ }).click();

  // マイページの見出しに新しい表示名が出る
  await page.goto("/mypage");
  await expect(page.getByText("自転車すきの人")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("大阪府")).toBeVisible();

  // 公開プロフィールにも反映される
  await page.goto(`/users/${profileId}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("自転車すきの人");
  await expect(page.getByText("週末はロングライドに出ています。")).toBeVisible();
});

test("表示名を空にすると保存されず、理由が出る", async ({ page }) => {
  await login(page, PROFILE_USER);
  await page.goto("/mypage/profile");

  await page.fill("#displayName", "");
  await page.getByRole("button", { name: /保存|更新/ }).click();

  await expect(page.getByText(/表示名/).first()).toBeVisible();
  // 元の表示名のまま
  await page.goto(`/users/${profileId}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("自転車すきの人");
});

test("パスワードを変えると、新しいほうでだけログインできる", async ({ page }) => {
  await login(page, PASSWORD_USER);
  await page.goto("/mypage/settings");

  await page.fill("#settings-password", NEW_PASSWORD);
  await page.fill("#settings-password-confirm", NEW_PASSWORD);
  await page.getByRole("button", { name: "パスワードを変更" }).click();
  await expect(page.getByText("パスワードを変更しました")).toBeVisible({ timeout: 20_000 });

  // 古いパスワードでは入れない
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill("#email", PASSWORD_USER);
  await page.fill("#password", TEST_PASSWORD);
  await page.click('button[type="submit"]:has-text("ログイン")');
  await expect(page.getByText(/メールアドレスまたはパスワード/)).toBeVisible({ timeout: 20_000 });

  // 新しいパスワードで入れる
  await page.fill("#password", NEW_PASSWORD);
  await page.click('button[type="submit"]:has-text("ログイン")');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
});

test("確認が一致しないパスワードは弾かれる", async ({ page }) => {
  await login(page, PROFILE_USER);
  await page.goto("/mypage/settings");

  await page.fill("#settings-password", "abcd1234");
  await page.fill("#settings-password-confirm", "abcd9999");
  await page.getByRole("button", { name: "パスワードを変更" }).click();

  await expect(page.getByText(/一致/)).toBeVisible({ timeout: 20_000 });
});

test("メールアドレスの変更は、新しいアドレス宛の確認で完了する", async ({ page }) => {
  test.skip(!(await mailcatcherAvailable()), "ローカル Supabase が起動していません");

  const nextEmail = `acct-email-next-${STAMP}@example.com`;
  const seen = new Set<string>();

  await login(page, EMAIL_USER);
  await page.goto("/mypage/settings");
  await page.fill("#new-email", nextEmail);
  await page.getByRole("button", { name: "確認メールを送信" }).click();
  await expect(page.getByText(/確認メールを送信しました/)).toBeVisible({ timeout: 20_000 });

  // 確認が済むまでは元のアドレスのまま
  const mail = await waitForMail(nextEmail, seen);
  expect(mail.Subject.length).toBeGreaterThan(0);

  const { data } = await adminDb()
    .from("users")
    .select("email")
    .eq("email", EMAIL_USER)
    .maybeSingle();
  expect(data?.email).toBe(EMAIL_USER);
});

test("通知設定は保存され、開き直しても残る", async ({ page }) => {
  await login(page, PROFILE_USER);
  await page.goto("/mypage/settings");

  const box = page.locator("#notify-message");
  const before = await box.getAttribute("data-state");
  await box.click();
  await expect(box).not.toHaveAttribute("data-state", before ?? "");

  await page.getByRole("button", { name: "通知設定を保存" }).click();
  await expect(page.getByText("通知設定を更新しました")).toBeVisible({ timeout: 20_000 });

  // 開き直しても、切り替えた状態のまま
  await page.reload();
  await expect(page.locator("#notify-message")).not.toHaveAttribute("data-state", before ?? "");
});

test("退会すると出品が取下げられ、以後ログインできない", async ({ page }) => {
  // 退会後に出品が取下げられることを見るため、1件だけ公開しておく
  const title = `E2E 退会確認の出品 ${STAMP}`;
  await adminDb().from("listings").insert({
    seller_id: withdrawId,
    title,
    description: "退会の確認用です。",
    category: "road",
    condition: "good",
    price: 60000,
    delivery_method: "shipping",
    shipping_from_pref: "13",
    status: "published",
    published_at: new Date().toISOString(),
  });

  await login(page, WITHDRAW_USER);
  await page.goto("/mypage/settings");

  // チェックを入れないと退会できない
  await page.getByRole("button", { name: "退会する" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "退会する" }).click();
  await expect(dialog.getByText(/チェック/)).toBeVisible({ timeout: 20_000 });

  await dialog.getByRole("checkbox").click();
  await dialog.getByRole("button", { name: "退会する" }).click();
  await page.waitForURL(/withdrawn=1/, { timeout: 30_000 });

  // 出品は取下げられ、検索に出ない
  await page.goto(`/search?q=${encodeURIComponent(title)}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("0件");

  // 以後ログインできない
  await page.goto("/login");
  await page.fill("#email", WITHDRAW_USER);
  await page.fill("#password", TEST_PASSWORD);
  await page.click('button[type="submit"]:has-text("ログイン")');
  await expect(page.locator("body")).toContainText(/ログイン/);
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
});
