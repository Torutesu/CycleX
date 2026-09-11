import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { publishOverdueReviews } from "@/features/review/batch";
import { cleanupStalePendingTransactions } from "@/features/transaction/webhook";
import { findStateMismatches } from "@/features/admin/queries";
import { cleanupOrphanListingImages } from "@/lib/storage";
import { sendStalledTransactionReminders } from "@/features/transaction/reminders";
import { pruneRateLimitHits } from "@/lib/rate-limit";

/**
 * 日次バッチ(ADR #8)。
 * Vercel Cron から Authorization: Bearer ${CRON_SECRET} 付きで呼ばれる。
 *
 * 1. 評価の14日自動公開と取引完了
 * 2. 未決済のまま放置された取引の掃除(Webhook 取りこぼしの保険)
 * 3. 取引と商品の状態ズレの検出(件数をログに残す。復旧は管理画面から手動)
 * 4. 保存されずに残った商品画像の回収
 * 5. 止まったままの取引の催促
 * 6. レート制限の古い記録の掃除
 *
 * どれも互いに独立しているので、1 つが失敗しても残りは実行する(issue #3)。
 * 以前は Promise.all で束ねていたため、たとえば Stripe が応答しないだけで
 * 評価の自動公開まで巻き込んで落ちていた。
 */

/**
 * 関数の実行時間上限(秒)。
 *
 * 指定が無いと Vercel の既定(数十秒)で途中で切られ、どこまで進んだか
 * 分からないまま誰も気づかない。60 秒は Hobby / Pro のどちらでも通る値。
 * それでも足りなくなったら `BATCH_LIMIT_PER_RUN` を下げるか、
 * Pro で 300 秒まで上げる。
 */
export const maxDuration = 60;

/** 各処理の結果。失敗しても null にせず、理由を残して応答に載せる */
type StepResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function runStep<T>(name: string, run: () => Promise<T>): Promise<StepResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    // 1 つの失敗で全体を落とさない。応答と Vercel のログの両方に残す
    console.error(`[cron] ${name} に失敗しました`, error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET が設定されていません");
    return NextResponse.json({ error: "設定エラー" }, { status: 500 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  const startedAt = Date.now();

  // 逐次実行。前の処理が失敗しても次へ進む
  const reviews = await runStep("評価の自動公開", () => publishOverdueReviews());
  const canceled = await runStep("未決済取引の掃除", () => cleanupStalePendingTransactions());
  const mismatches = await runStep("状態ズレの検出", () => findStateMismatches());
  const orphanImages = await runStep("孤児画像の回収", () => cleanupOrphanListingImages());
  const reminders = await runStep("停滞取引の催促", () => sendStalledTransactionReminders());
  const rateLimitHits = await runStep("レート制限の記録の掃除", () => pruneRateLimitHits());

  if (mismatches.ok && mismatches.value.length > 0) {
    console.error("[cron] 取引と商品の状態が食い違っています", mismatches.value);
  }

  const steps = { reviews, canceled, mismatches, orphanImages, reminders, rateLimitHits };
  const failed = Object.entries(steps)
    .filter(([, result]) => !result.ok)
    .map(([name]) => name);

  // 上限に達した処理は、残りが翌日以降に回っていることを応答で分かるようにする
  const capped = [
    reviews.ok && reviews.value.capped ? "reviews" : null,
    reminders.ok && reminders.value.capped ? "reminders" : null,
  ].filter((name): name is string => name !== null);

  const body = {
    ok: failed.length === 0,
    durationMs: Date.now() - startedAt,
    failed,
    capped,
    reviews: reviews.ok ? reviews.value : null,
    canceledStalePayments: canceled.ok ? canceled.value : null,
    stateMismatches: mismatches.ok ? mismatches.value.length : null,
    orphanImagesRemoved: orphanImages.ok ? orphanImages.value : null,
    reminders: reminders.ok ? reminders.value : null,
    rateLimitHitsPruned: rateLimitHits.ok ? rateLimitHits.value : null,
    errors: Object.fromEntries(
      Object.entries(steps).flatMap(([name, result]) => (result.ok ? [] : [[name, result.error]])),
    ),
  };

  if (failed.length > 0) {
    console.error(`[cron] ${failed.length} 件の処理が失敗しました: ${failed.join(", ")}`);
  }
  if (capped.length > 0) {
    console.warn(`[cron] 件数上限に達しました(残りは次回): ${capped.join(", ")}`);
  }

  // 一部でも失敗したら 500。Vercel の Cron ログとアラートで気づけるようにする
  return NextResponse.json(body, { status: failed.length > 0 ? 500 : 200 });
}
