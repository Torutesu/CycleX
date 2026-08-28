import { NextResponse, type NextRequest } from "next/server";
import { publishOverdueReviews } from "@/features/review/batch";
import { cleanupStalePendingTransactions } from "@/features/transaction/webhook";
import { findStateMismatches } from "@/features/admin/queries";

/**
 * 日次バッチ(ADR #8)。
 * Vercel Cron から Authorization: Bearer ${CRON_SECRET} 付きで呼ばれる。
 *
 * 1. 評価の14日自動公開と取引完了
 * 2. 未決済のまま放置された取引の掃除(Webhook 取りこぼしの保険)
 * 3. 取引と商品の状態ズレの検出(件数をログに残す。復旧は管理画面から手動)
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET が設定されていません");
    return NextResponse.json({ error: "設定エラー" }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  try {
    const [reviews, canceled, mismatches] = await Promise.all([
      publishOverdueReviews(),
      cleanupStalePendingTransactions(),
      findStateMismatches(),
    ]);

    if (mismatches.length > 0) {
      console.error("[cron] 取引と商品の状態が食い違っています", mismatches);
    }

    return NextResponse.json({
      ok: true,
      reviews,
      canceledStalePayments: canceled,
      stateMismatches: mismatches.length,
    });
  } catch (error) {
    console.error("[cron] 日次バッチに失敗しました", error);
    return NextResponse.json({ error: "処理に失敗しました" }, { status: 500 });
  }
}
