/**
 * proxy(旧 middleware)のルート保護の判定。DB に触れない部分だけをここに置き、
 * テストで網羅する。
 */

/** ログイン必須のパス(前方一致) */
export const PROTECTED_PREFIXES = [
  "/sell",
  "/mypage",
  "/messages",
  "/transactions",
  "/purchase",
] as const;

/** 管理者のみアクセス可能なパス */
export const ADMIN_PREFIX = "/admin";

/** 停止中でも到達できるパス(停止画面そのもの、認証のコールバック、外部起点の API) */
const SUSPENDED_ALLOWED_PREFIXES = ["/suspended", "/auth", "/api", "/login"] as const;

function startsWithPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => startsWithPath(pathname, prefix));
}

export function isAdminPath(pathname: string): boolean {
  return startsWithPath(pathname, ADMIN_PREFIX);
}

export type AccountStatus = "active" | "suspended" | "withdrawn";

export type AccessDecision =
  { kind: "allow" } | { kind: "login" } | { kind: "suspended" } | { kind: "not_found" };

/**
 * リクエストをどう扱うか。
 *
 * @param pathname   要求パス
 * @param loggedIn   セッションがあるか
 * @param status     JWT の app_metadata に載せた状態(停止・退会時に書き込む)。
 *                   無ければ null(= 通常の利用者として扱う)
 * @param role       会員向け・管理パスのときだけ DB から引いた役割。それ以外は null
 */
export function decideAccess(
  pathname: string,
  loggedIn: boolean,
  status: AccountStatus | null,
  role: "user" | "admin" | null,
): AccessDecision {
  const needsLogin = isProtectedPath(pathname) || isAdminPath(pathname);

  if (!loggedIn) {
    return needsLogin ? { kind: "login" } : { kind: "allow" };
  }

  // 停止・退会済みは、公開ページを含む全画面で停止画面のみ(FR-11)。
  // ログアウトや停止画面自体には到達できるようにする
  if (status === "suspended" || status === "withdrawn") {
    const allowed = SUSPENDED_ALLOWED_PREFIXES.some((prefix) => startsWithPath(pathname, prefix));
    return allowed ? { kind: "allow" } : { kind: "suspended" };
  }

  // 管理画面の存在自体を隠すため、権限不足は 404 として扱う
  if (isAdminPath(pathname) && role !== "admin") {
    return { kind: "not_found" };
  }

  return { kind: "allow" };
}
