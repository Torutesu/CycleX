import { assertProductionEnv } from "@/lib/env";
import { initErrorReporting } from "@/lib/observability";

/**
 * サーバー起動時に一度だけ呼ばれる(Next.js の instrumentation 規約)。
 *
 * - 本番で環境変数が欠けていれば、リクエストを受ける前に落として気づけるようにする
 * - 障害検知(Sentry)を初期化する。DSN が未設定なら何もしない(issue #5)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertProductionEnv();
    initErrorReporting();
  }
}
