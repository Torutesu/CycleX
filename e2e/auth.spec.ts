import { test, expect, type Page } from "@playwright/test";
import { linkInMail, mailcatcherAvailable, waitForMail } from "./mail";

/**
 * 認証まわりの通し(FR-01)。
 *
 * 会員登録 → 確認メールのリンク → ログイン状態、
 * パスワードリセット → メールのリンク → 新パスワードでログイン、までを検証する。
 *
 * ローカル Supabase のメールキャッチャー(54324)を読むため、
 * `supabase start` が動いている環境でのみ実行する。
 */

const PASSWORD = "abcd1234";
const NEW_PASSWORD = "zyxw9876";

async function signedInAs(page: Page): Promise<boolean> {
  await page.goto("/mypage");
  return !page.url().includes("/login");
}

test.describe("認証", () => {
  test.beforeAll(async () => {
    test.skip(!(await mailcatcherAvailable()), "ローカル Supabase が起動していません");
  });

  test("会員登録 → 確認メール → パスワードリセットまで通る", async ({ page }) => {
    const email = `e2e-auth-${Date.now()}@example.com`;
    const seen = new Set<string>();

    // --- 会員登録 ---
    await page.goto("/signup");
    await page.fill("#displayName", "E2E認証");
    await page.fill("#email", email);
    await page.fill("#password", PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/verify-email/);

    // --- 確認メールのリンクでログイン状態になる ---
    const confirmation = await waitForMail(email, seen);
    await page.goto(await linkInMail(confirmation.ID));
    expect(page.url()).not.toContain("/login");
    await expect(page.getByRole("navigation", { name: "メインナビゲーション" })).toContainText(
      "マイページ",
    );

    // --- パスワードリセット ---
    await page.goto("/reset-password");
    await page.fill("#email", email);
    await page.click('button[type="submit"]');

    const recovery = await waitForMail(email, seen);
    await page.goto(await linkInMail(recovery.ID));
    // next が欠けていてもリセットは更新画面へ着地すること
    await expect(page).toHaveURL(/\/reset-password\/update/);

    await page.fill("#password", NEW_PASSWORD);
    await page.fill("#passwordConfirm", NEW_PASSWORD);
    await page.click('button[type="submit"]');

    // --- 新しいパスワードでログインし直せる ---
    await page.goto("/mypage");
    await page.click('button[aria-label="アカウントメニュー"]');
    await page.click('button:has-text("ログアウト")');
    await page.waitForURL("/");

    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", NEW_PASSWORD);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    expect(await signedInAs(page)).toBe(true);
  });

  test("切れたリンクを踏むと理由が表示される", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied&error_code=otp_expired");
    await expect(page).toHaveURL(/\/login\?error=expired/);
    await expect(page.getByText("リンクの有効期限が切れています")).toBeVisible();

    await page.goto("/auth/callback?token_hash=broken&type=recovery");
    await expect(page).toHaveURL(/\/login\?error=callback/);
    await expect(page.getByText("リンクを確認できませんでした")).toBeVisible();
  });
});

test("入力に不備があっても、打ち直しになるのはパスワードだけ", async ({ page }) => {
  // ログイン: メールアドレスは残る
  await page.goto("/login");
  await page.fill("#email", "keep-me@example.com");
  await page.fill("#password", "wrongpass1");
  await page.click('button[type="submit"]:has-text("ログイン")');
  await expect(page.getByText(/メールアドレスまたはパスワード/)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#email")).toHaveValue("keep-me@example.com");

  // 会員登録: 名前とメールは残る
  await page.goto("/signup");
  await page.fill("#displayName", "やまもと");
  await page.fill("#email", "keep-signup@example.com");
  await page.fill("#password", "short");
  await page.click('button[type="submit"]');
  await expect(page.locator("#displayName")).toHaveValue("やまもと", { timeout: 20_000 });
  await expect(page.locator("#email")).toHaveValue("keep-signup@example.com");

  // パスワード再設定の依頼: メールは残る
  await page.goto("/reset-password");
  await page.fill("#email", "not-an-email");
  await page.click('button[type="submit"]');
  await expect(page.locator("#email")).toHaveValue("not-an-email", { timeout: 20_000 });
});
