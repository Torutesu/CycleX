import type { EmailOtpType } from "@supabase/supabase-js";
import { safeRedirectPath } from "@/lib/utils";

/**
 * `/auth/callback` に何が届いたかの判定(FR-01-1 / FR-01-2 / FR-01-4)。
 *
 * Supabase からの戻りは 3 通りある。
 *
 * - `?code=`       : PKCE。OAuth と、同じブラウザで開始したメール確認・リセット
 * - `?token_hash=` : メールテンプレートを `{{ .TokenHash }}` 形式にした場合。
 *                    PKCE の検証子はブラウザの Cookie にあるため、
 *                    登録した端末とメールを開く端末が違うと `?code=` は必ず失敗する。
 *                    そちらでも通せるようこの形式を受け付ける。
 * - `?error=`      : リンクの期限切れなど、Supabase 側で失敗したとき
 *
 * 副作用を持たないのでテストで網羅する。
 */
export type CallbackDecision =
  | { kind: "code"; code: string; next: string }
  | { kind: "otp"; tokenHash: string; type: EmailOtpType; next: string }
  | { kind: "error"; reason: "expired" | "callback" | "banned" };

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

/** リンクの種類ごとの既定の遷移先。テンプレートが next を持たない場合に使う */
const DEFAULT_NEXT: Partial<Record<EmailOtpType, string>> = {
  recovery: "/reset-password/update",
  email_change: "/mypage/settings",
};

/** 期限切れ・使用済みを表す Supabase のエラーコード */
const EXPIRED_CODES = new Set(["otp_expired", "access_denied"]);

export function decideAuthCallback(params: URLSearchParams): CallbackDecision {
  // error_code の方が具体的(user_banned など)。access_denied は汎用なので後回し
  const errorCode = params.get("error_code") ?? params.get("error");
  if (errorCode) {
    if (errorCode === "user_banned") return { kind: "error", reason: "banned" };
    return { kind: "error", reason: EXPIRED_CODES.has(errorCode) ? "expired" : "callback" };
  }

  const rawNext = params.get("next");
  const code = params.get("code");
  if (code) {
    return { kind: "code", code, next: safeRedirectPath(rawNext, "/mypage") };
  }

  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (tokenHash && type && (OTP_TYPES as readonly string[]).includes(type)) {
    const otpType = type as EmailOtpType;
    return {
      kind: "otp",
      tokenHash,
      type: otpType,
      next: safeRedirectPath(rawNext, DEFAULT_NEXT[otpType] ?? "/mypage"),
    };
  }

  return { kind: "error", reason: "callback" };
}
