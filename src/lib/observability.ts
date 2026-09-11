/**
 * 障害検知(issue #5)。
 *
 * これまで失敗は `console.error` に出るだけで、通知先が無かった。
 * Stripe Webhook の連続失敗・メール送信の失敗・日次バッチの停止は、
 * どれも気づかなければ取引が進まないまま放置される。
 *
 * Sentry の DSN が設定されているときだけ有効になる。未設定なら
 * 従来どおり `console.error` に出すだけで、動作は変わらない
 * (ローカル・CI・Preview で外部へ送らないため)。
 *
 * `server-only` は付けない。instrumentation.ts から読み込む。
 */

import * as Sentry from "@sentry/nextjs";
import { isProductionRuntime } from "@/lib/env";

/** Sentry へ送るかどうか。DSN が無ければ何もしない */
export function isErrorReportingEnabled(env = process.env): boolean {
  return Boolean(env.SENTRY_DSN);
}

/**
 * Next.js の制御フロー用の例外。
 *
 * `redirect()` と `notFound()` は例外を投げて実現されているため、
 * これを障害として送ると無料枠(月 5,000 件)が一瞬で埋まる。
 * 正常な遷移なので除外する。
 */
const CONTROL_FLOW_DIGESTS = ["NEXT_REDIRECT", "NEXT_NOT_FOUND", "NEXT_HTTP_ERROR_FALLBACK"];

function isControlFlow(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return CONTROL_FLOW_DIGESTS.some((prefix) => digest.startsWith(prefix));
}

/** サーバー起動時に一度だけ呼ぶ(instrumentation.ts から) */
export function initErrorReporting(env = process.env): void {
  if (!isErrorReportingEnabled(env)) {
    if (isProductionRuntime(env)) {
      // 本番で未設定なのは設定漏れの可能性が高い。起動は止めない
      console.warn("[observability] SENTRY_DSN が未設定です。障害は console にしか残りません。");
    }
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.VERCEL_ENV ?? env.NODE_ENV ?? "development",
    // どのデプロイで起きたかを追えるようにする
    release: env.VERCEL_GIT_COMMIT_SHA,
    // 個人情報を扱うサービスなので、既定の PII 収集は切る。
    // メールアドレス・住所・メッセージ本文が Sentry へ渡らないようにする
    sendDefaultPii: false,
    // 性能トレースは使わない(無料枠はエラーに使いたい)
    tracesSampleRate: 0,
    beforeSend(event, hint) {
      if (isControlFlow(hint?.originalException)) return null;
      // Cookie とヘッダは念のため落とす(セッションと個人情報が載る)
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
      }
      return event;
    },
  });
}

/**
 * 障害を記録する。
 *
 * `console.error` は常に出す(Vercel のログに残す)。
 * Sentry が有効ならそちらにも送り、`context` をタグにして絞り込めるようにする。
 *
 * @param context どの経路で起きたか(`stripe_webhook`、`cron` など)
 * @param extra 併せて残したい情報。個人情報を入れないこと
 */
export function reportError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  console.error(`[${context}]`, error, extra ?? "");

  if (!isErrorReportingEnabled()) return;
  if (isControlFlow(error)) return;

  Sentry.withScope((scope) => {
    scope.setTag("context", context);
    if (extra) scope.setContext("詳細", extra);
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      // Supabase / PostgREST のエラーは Error 型ではないので、
      // そのまま String() にすると "[object Object]" になり原因が分からなくなる
      Sentry.captureException(new Error(`${context}: ${describe(error)}`));
    }
  });
}

/**
 * Error でない値を読める文字列にする。
 * Supabase のエラーは `{ message, code, details, hint }` の形で来る。
 */
function describe(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const parts = [e.message, e.code && `code=${String(e.code)}`, e.details, e.hint]
      .filter((part) => typeof part === "string" && part.length > 0)
      .map(String);
    if (parts.length > 0) return parts.join(" / ");
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/**
 * 送信待ちを吐き出す。
 *
 * Vercel のような環境では応答を返した時点で関数が止まり得るため、
 * 障害を記録したリクエストは返す前にこれを待つ。
 * 無効なとき・API が無いときは何もしない。
 */
export async function flushErrorReports(timeoutMs = 2000): Promise<void> {
  if (!isErrorReportingEnabled()) return;
  try {
    // 解決されるビルドによって flush の置き場所が違うため、両方を見る
    const candidate = (Sentry as unknown as Record<string, unknown>).flush;
    if (typeof candidate === "function") {
      await (candidate as (t?: number) => Promise<boolean>)(timeoutMs);
      return;
    }
    const client = (
      Sentry as unknown as { getClient?: () => { flush?: (t?: number) => Promise<boolean> } }
    ).getClient?.();
    await client?.flush?.(timeoutMs);
  } catch (error) {
    console.warn("[observability] 送信待ちの吐き出しに失敗しました", error);
  }
}

/**
 * 障害ではないが人が気づくべき事象を記録する。
 * 例: 日次バッチが件数上限に達した、返金が必要な取引が残っている。
 */
export function reportWarning(
  context: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  console.warn(`[${context}] ${message}`, extra ?? "");

  if (!isErrorReportingEnabled()) return;

  Sentry.withScope((scope) => {
    scope.setTag("context", context);
    scope.setLevel("warning");
    if (extra) scope.setContext("詳細", extra);
    Sentry.captureMessage(message);
  });
}
