import { assertProductionEnv } from "@/lib/env";

/**
 * サーバー起動時に一度だけ呼ばれる(Next.js の instrumentation 規約)。
 * 本番で環境変数が欠けていれば、リクエストを受ける前に落として気づけるようにする。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertProductionEnv();
  }
}
