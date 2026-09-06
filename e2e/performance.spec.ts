import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { adminDb, ensureUser, login } from "./helpers";

/**
 * 画面ごとの DB 問い合わせ回数の見張り。
 *
 * 1画面で同じ問い合わせを何度も投げる作りに戻っていないかを見る。
 * 件数はローカルの Supabase(Docker)のアクセスログから数えるので、
 * その環境でだけ実行する。
 *
 * 上限は「いまの実測 + 少し」。増やすときは、その理由を添えて上げること。
 */

const KONG = "supabase_kong_CycleX";
const USER = "perf@example.com";

let itemId = "";
let available = true;

function logLines(): number {
  return Number(execSync(`docker logs ${KONG} 2>&1 | wc -l`).toString().trim());
}

test.beforeAll(async () => {
  try {
    logLines();
  } catch {
    available = false;
    return;
  }
  await ensureUser(USER, "性能確認");
  const { data } = await adminDb()
    .from("listings")
    .select("id")
    .eq("status", "published")
    .limit(1)
    .maybeSingle();
  itemId = data?.id ?? "";
});

/** その画面を描くのに何回 DB を引いたか */
async function queriesFor(page: import("@playwright/test").Page, path: string): Promise<number> {
  // 先読みぶんを数えないよう、いったん静かにしてから測る
  await page.waitForTimeout(400);
  const before = logLines();
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), path).toBeLessThan(400);
  return logLines() - before;
}

test("公開画面が、必要以上に DB を引いていない", async ({ page }) => {
  test.skip(!available, "ローカルの Supabase(Docker)が無い");

  // ホームはカテゴリ8種の件数を出すが、数えるのは1回で足りる
  expect(await queriesFor(page, "/"), "ホーム").toBeLessThanOrEqual(6);
  expect(await queriesFor(page, "/search"), "検索").toBeLessThanOrEqual(5);
  expect(await queriesFor(page, "/search?q=Trek&category=road"), "絞り込み").toBeLessThanOrEqual(6);
  expect(await queriesFor(page, "/login"), "ログイン").toBeLessThanOrEqual(2);
});

test("会員向けの画面が、必要以上に DB を引いていない", async ({ page }) => {
  test.skip(!available, "ローカルの Supabase(Docker)が無い");
  await login(page, USER);

  // 出品管理は6つのタブの件数を出すが、まとめて1回で数える
  expect(await queriesFor(page, "/mypage/listings"), "出品管理").toBeLessThanOrEqual(10);
  expect(await queriesFor(page, "/mypage"), "マイページ").toBeLessThanOrEqual(14);
  expect(await queriesFor(page, "/mypage/favorites"), "お気に入り").toBeLessThanOrEqual(9);
  expect(await queriesFor(page, "/sell"), "出品フォーム").toBeLessThanOrEqual(9);
  expect(await queriesFor(page, "/messages"), "メッセージ一覧").toBeLessThanOrEqual(8);
});

test("商品ページが、必要以上に DB を引いていない", async ({ page }) => {
  test.skip(!available || !itemId, "ローカルの Supabase か公開中の商品が無い");
  expect(await queriesFor(page, `/items/${itemId}`), "商品ページ").toBeLessThanOrEqual(13);
});

test("メッセージ一覧は、全メッセージを引かずに組み立てる", async ({ page }) => {
  test.skip(!available, "ローカルの Supabase(Docker)が無い");
  await login(page, USER);

  await page.waitForTimeout(400);
  const before = logLines();
  await page.goto("/messages", { waitUntil: "domcontentloaded" });
  const log = execSync(`docker logs ${KONG} 2>&1 | tail -n +${before + 1}`).toString();

  // スレッド全部の本文を運んでから数える作りに戻っていないこと
  const messageQueries = (log.match(/GET \/rest\/v1\/messages/g) ?? []).length;
  expect(messageQueries, "一覧のためにメッセージ本文を引いている").toBe(0);
  expect((log.match(/rpc\/thread_summaries/g) ?? []).length).toBeGreaterThan(0);
});

test("未読の件数は1回の問い合わせで求める", async ({ page }) => {
  test.skip(!available, "ローカルの Supabase(Docker)が無い");
  await login(page, USER);

  await page.waitForTimeout(400);
  const before = logLines();
  await page.goto("/mypage/favorites", { waitUntil: "domcontentloaded" });
  const log = execSync(`docker logs ${KONG} 2>&1 | tail -n +${before + 1}`).toString();

  // スレッドを全部引いてから数える作りに戻っていないこと
  const threadQueries = (log.match(/GET \/rest\/v1\/threads/g) ?? []).length;
  expect(threadQueries, "未読のためにスレッドを引いている").toBe(0);
  expect((log.match(/rpc\/unread_message_count/g) ?? []).length).toBeGreaterThan(0);
});
