/**
 * 認証・退会まわりの純粋な業務ルール。
 * "use server" ファイルからは async 関数しか export できないため、
 * テスト対象となる同期ロジックはここに置く。
 */

/** FR-01-5: 進行中の取引が1件でもあると退会できない */
export function canWithdraw(activeTransactionCount: number): boolean {
  return activeTransactionCount === 0;
}

/** ログイン後にアカウント状態から遷移先を決める */
export function resolvePostLoginPath(
  status: "active" | "suspended" | "withdrawn" | null | undefined,
  next: string,
): { path: string; signOut: boolean; error?: string } {
  if (status === "withdrawn") {
    return {
      path: "/login",
      signOut: true,
      error: "このアカウントは退会済みです。新規に会員登録してください。",
    };
  }
  if (status === "suspended") {
    return { path: "/suspended", signOut: false };
  }
  return { path: next, signOut: false };
}
