/**
 * Server Action の戻り値を統一するためのヘルパー。
 * フォームからは `useActionState` などで受け取り、エラーは日本語で画面に表示する。
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** 業務ルール違反を表す例外。メッセージはそのままユーザーに表示してよい。 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

/** PostgreSQL の一意制約違反 */
export const PG_UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

/** 想定外の例外をユーザー向けメッセージへ変換する */
export function toUserMessage(error: unknown, fallback = "処理に失敗しました。時間をおいて再度お試しください。"): string {
  if (error instanceof AppError) return error.message;
  return fallback;
}
