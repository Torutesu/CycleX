import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const TEST_PASSWORD = "abcd1234";

export function adminDb() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/**
 * メール確認済みのテストユーザーを用意する。
 * `enable_confirmations = true` のままでも、admin API で確認済みとして作成できる。
 */
export async function ensureUser(email: string, displayName: string): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    }),
  });

  if (response.ok) {
    const created = (await response.json()) as { id: string };
    return created.id;
  }

  // すでに存在する場合は既存の ID を返す
  const { data } = await adminDb().from("users").select("id").eq("email", email).maybeSingle();
  if (!data) throw new Error(`テストユーザーを用意できません: ${email}`);
  return data.id;
}

export async function login(page: Page, email: string): Promise<void> {
  // すでに誰かでログインしていると /login は素通りしてしまうので、
  // 必ず未ログインの状態から始める
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", TEST_PASSWORD);
  await page.click('button[type="submit"]:has-text("ログイン")');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

/** 1x1 の PNG(アップロード検証用の最小画像) */
export const TEST_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
