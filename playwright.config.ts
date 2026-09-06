import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

// helpers.ts が service role キーを使うため .env.local を読む(scripts/ と同じ方式)。
// 既に環境変数がある場合はそちらを優先する。
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (process.env[key]) continue;
    process.env[key] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
} catch {
  // .env.local が無い環境(CI など)ではそのまま進む
}

/**
 * E2E スモーク(Phase 8)。
 * ローカルの Supabase が起動している前提で、主要動線を1本だけ検証する。
 *
 *   pnpm db:reset && pnpm test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // スマホファーストで設計しているため、既定はモバイル幅で検証する
    viewport: { width: 375, height: 812 },
    trace: "retain-on-failure",
    locale: "ja-JP",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
