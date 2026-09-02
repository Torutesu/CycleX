import { test, expect, type Page } from "@playwright/test";

/**
 * 認証まわりの通し(FR-01)。
 *
 * 会員登録 → 確認メールのリンク → ログイン状態、
 * パスワードリセット → メールのリンク → 新パスワードでログイン、までを検証する。
 *
 * ローカル Supabase のメールキャッチャー(54324)を読むため、
 * `supabase start` が動いている環境でのみ実行する。
 */

// Supabase CLI のメールキャッチャー。ホストされた環境では動かないので skip する
const MAIL_API = "http://127.0.0.1:54324/api/v1";
const PASSWORD = "abcd1234";
const NEW_PASSWORD = "zyxw9876";

type MailSummary = { ID: string; Subject: string; To: { Address: string }[] };

async function mailcatcherAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${MAIL_API}/messages?limit=1`);
    return response.ok;
  } catch {
    return false;
  }
}

/** 宛先に届いたメールのうち、既読済み ID を除いた最新の1通を待つ */
async function waitForMail(to: string, seen: Set<string>): Promise<MailSummary> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(`${MAIL_API}/messages?limit=50`);
    const { messages } = (await response.json()) as { messages: MailSummary[] };
    const hit = messages.find(
      (m) => !seen.has(m.ID) && m.To.some((address) => address.Address === to),
    );
    if (hit) {
      seen.add(hit.ID);
      return hit;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`メールが届きません: ${to}`);
}

/** メール本文から認証リンクを取り出す */
async function linkInMail(id: string): Promise<string> {
  const response = await fetch(`${MAIL_API}/message/${id}`);
  const body = (await response.json()) as { HTML?: string; Text?: string };
  const urls = (body.HTML || body.Text || "").match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const link = urls.find((url) => url.includes("/verify") || url.includes("/auth/callback"));
  if (!link) throw new Error("メール本文に認証リンクがありません");
  return link.replace(/&amp;/g, "&");
}

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
