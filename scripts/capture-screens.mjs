/** プロジェクトルートから実行する: node scripts/capture-screens.mjs */
/** 画面確認用のスクリーンショット撮影 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^"|"$/g, ""),
      ];
    }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BASE = "http://localhost:3000";
const OUT = process.env.SHOTS_DIR ?? "/tmp/shots";
mkdirSync(OUT, { recursive: true });

// 画像付きの商品を優先して選ぶ
const { data: item } = await db
  .from("listings")
  .select("id, listing_images!inner(id)")
  .eq("status", "published")
  .limit(1)
  .single();
const { data: seller } = await db
  .from("users")
  .select("id")
  .eq("email", "yamada@cyclex.test")
  .single();

// 会員向けの画面は sato で撮る。本人が当事者のものを選ばないと 404 になる
const { data: buyer } = await db
  .from("users")
  .select("id")
  .eq("email", "sato@cyclex.test")
  .single();
const { data: thread } = await db
  .from("threads")
  .select("id")
  .eq("buyer_id", buyer.id)
  .limit(1)
  .maybeSingle();
const { data: txDone } = await db
  .from("transactions")
  .select("id")
  .eq("buyer_id", buyer.id)
  .eq("status", "completed")
  .limit(1)
  .maybeSingle();
const { data: txActive } = await db
  .from("transactions")
  .select("id")
  .eq("buyer_id", buyer.id)
  .in("status", ["paid", "shipped", "received"])
  .limit(1)
  .maybeSingle();

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function session(email, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  if (email) {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill("#email", email);
    await page.fill("#password", "パスワード123");
    await page.click('button[type="submit"]:has-text("ログイン")');
    await page.waitForTimeout(2500);
  }
  return page;
}

async function shot(page, name, path, opts = {}) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  // 開発時のみ出る Next.js のインジケータはスクリーンショットから外す
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await page.waitForTimeout(opts.wait ?? 1200);
  if (opts.before) await opts.before(page);

  // 一覧カード用: 端末の画面比率のまま(ビューポート内)
  await page.screenshot({ path: `${OUT}/${name}--card.jpg`, type: "jpeg", quality: 78 });
  // 拡大表示用: ページ全体
  if (opts.full) {
    await page.screenshot({
      path: `${OUT}/${name}.jpg`,
      type: "jpeg",
      quality: 78,
      fullPage: true,
    });
  } else {
    await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 78 });
  }
  console.log("shot:", name);
}

// ============ モバイル(375px) ============
const guest = await session(null, 375);
await shot(guest, "m-home", "/", { full: true });
await shot(guest, "m-search", "/search", { full: true });
await shot(guest, "m-search-filter", "/search", {
  before: async (p) => {
    await p.click('button:has-text("絞り込み")');
    await p.waitForTimeout(1200);
    // シート内部が途中までスクロールされることがあるため先頭に戻す
    await p.evaluate(() => {
      document.querySelectorAll('[role="dialog"] .overflow-y-auto').forEach((el) => {
        el.scrollTop = 0;
      });
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(400);
  },
});
await shot(guest, "m-item", `/items/${item.id}`, { full: true });
await shot(guest, "m-profile", `/users/${seller.id}`, { full: true });
await shot(guest, "m-login", "/login", { full: true });
await shot(guest, "m-signup", "/signup", { full: true });

const buyer = await session("sato@cyclex.test", 375);
await shot(buyer, "m-mypage", "/mypage", { full: true });
await shot(buyer, "m-favorites", "/mypage/favorites", { full: true });
await shot(buyer, "m-messages", "/messages", { full: true });
if (thread) await shot(buyer, "m-thread", `/messages/${thread.id}`, { full: true });
await shot(buyer, "m-purchase", `/items/${item.id}/purchase`, { full: true });
if (txActive) await shot(buyer, "m-transaction", `/transactions/${txActive.id}`, { full: true });
if (txDone) await shot(buyer, "m-transaction-done", `/transactions/${txDone.id}`, { full: true });
if (txDone) await shot(buyer, "m-review", `/transactions/${txDone.id}/review`, { full: true });
await shot(buyer, "m-purchases", "/mypage/purchases", { full: true });
await shot(buyer, "m-settings", "/mypage/settings", { full: true });

const seller2 = await session("yamada@cyclex.test", 375);
await shot(seller2, "m-sell", "/sell", { full: true });
await shot(seller2, "m-listings", "/mypage/listings", { full: true });

// ============ デスクトップ(1280px) ============
const guestPc = await session(null, 1280);
await shot(guestPc, "d-home", "/");
await shot(guestPc, "d-search", "/search");
await shot(guestPc, "d-item", `/items/${item.id}`);
await shot(guestPc, "d-profile", `/users/${seller.id}`);

const sellerPc = await session("yamada@cyclex.test", 1280);
await shot(sellerPc, "d-sell", "/sell");

const adminPc = await session("admin@cyclex.test", 1280);
await shot(adminPc, "d-admin", "/admin");
await shot(adminPc, "d-admin-users", "/admin/users");
await shot(adminPc, "d-admin-listings", "/admin/listings");
await shot(adminPc, "d-admin-transactions", "/admin/transactions");
await shot(adminPc, "d-admin-reports", "/admin/reports");
await shot(adminPc, "d-admin-brands", "/admin/brands");

await browser.close();
console.log("done");
