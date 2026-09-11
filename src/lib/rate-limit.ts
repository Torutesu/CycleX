import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";

/**
 * レート制限(ADR #10 / issue #8, #9)。
 *
 * 判定と記録は PostgreSQL の `consume_rate_limit` に寄せてある。
 * 旧実装は対象テーブルの直近レコードを数え、そのあと呼び出し側が INSERT して
 * いたため、数えてから書くまでの間に割り込まれて上限を超えられた。
 * さらに DB エラー時は通過させていたので、判定できないときは無制限だった。
 *
 * 現在はキーごとに助言ロックで直列化し、判定できなければ通さない
 * (fail-closed)。制限を評価するのは同じ DB への書き込みを伴う操作だけなので、
 * DB が応答しないなら業務処理自体も成立しない。
 * 「判定できないから無制限」より「判定できないから断る」方が安全側に倒れる。
 */
type RateLimitPolicy = {
  /** 上限件数 */
  limit: number;
  /** 集計する時間窓(秒) */
  windowSeconds: number;
  /** 制限に掛かった際のメッセージ */
  message: string;
};

const AUTH_THROTTLE_MESSAGE = "試行が続いています。しばらく時間をおいてから再度お試しください。";

export const RATE_LIMITS = {
  message_send: {
    limit: 10,
    windowSeconds: 60,
    message: "メッセージの送信が続いています。しばらく待ってから再度お試しください。",
  },
  report_submit: {
    limit: 5,
    windowSeconds: 60 * 60,
    message: "通報の送信が続いています。しばらく待ってから再度お試しください。",
  },
  listing_create: {
    limit: 10,
    windowSeconds: 60 * 60,
    message: "短時間に多くの出品が行われています。しばらく待ってから再度お試しください。",
  },

  // 認証系(issue #8)。ログイン前なので利用者 ID が無く、
  // メールアドレスのハッシュと接続元 IP で数える。
  // アカウント列挙を防ぐため、文言は成否や理由を明かさない共通のものにする。
  auth_login: { limit: 10, windowSeconds: 10 * 60, message: AUTH_THROTTLE_MESSAGE },
  auth_login_ip: { limit: 30, windowSeconds: 10 * 60, message: AUTH_THROTTLE_MESSAGE },
  auth_signup: { limit: 5, windowSeconds: 60 * 60, message: AUTH_THROTTLE_MESSAGE },
  auth_signup_ip: { limit: 15, windowSeconds: 60 * 60, message: AUTH_THROTTLE_MESSAGE },
  // メール送信の踏み台にされないよう、送信系はより厳しくする
  auth_password_reset: { limit: 5, windowSeconds: 60 * 60, message: AUTH_THROTTLE_MESSAGE },
  auth_password_reset_ip: { limit: 15, windowSeconds: 60 * 60, message: AUTH_THROTTLE_MESSAGE },
  auth_verify_resend: { limit: 5, windowSeconds: 60 * 60, message: AUTH_THROTTLE_MESSAGE },
  auth_verify_resend_ip: { limit: 15, windowSeconds: 60 * 60, message: AUTH_THROTTLE_MESSAGE },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitKey = keyof typeof RATE_LIMITS;

/**
 * メールアドレスは生のまま保存しない。
 *
 * 制限の記録は service_role からしか読めず日次で捨てているが、
 * 「誰がログインを試したか」の一覧を作る必要はないのでハッシュで十分。
 * 小文字化して前後の空白を落とし、同じ人が同じキーになるようにする。
 */
function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/**
 * 接続元 IP。Vercel は `x-forwarded-for` の先頭に実クライアントを入れる。
 * 取れない場合は "unknown" にまとめる(その塊で 1 つの枠を共有する)。
 */
async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headerList.get("x-real-ip")?.trim() || "unknown";
}

/**
 * 上限を超えていれば AppError を投げる。超えていなければ 1 回分を消費する。
 *
 * @param key 制限の単位。利用者 ID など
 */
export async function assertRateLimit(key: string, bucket: RateLimitKey): Promise<void> {
  const policy: RateLimitPolicy = RATE_LIMITS[bucket];
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_key: key,
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds,
  });

  if (error) {
    // 判定できないときは通さない。無制限に通すより安全側に倒す
    console.error("[rate limit] 判定に失敗したため操作を拒否しました", bucket, error);
    throw new AppError(
      "混雑しているため、この操作を受け付けられませんでした。時間をおいて再度お試しください。",
    );
  }

  if (data !== true) {
    throw new AppError(policy.message);
  }
}

/**
 * 窓を過ぎた記録を捨てる(日次バッチから呼ぶ)。
 * 判定には使わない行なので、残しておくとテーブルが太るだけ。
 */
export async function pruneRateLimitHits(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("prune_rate_limit_hits", {
    p_older_than_hours: 48,
  });
  if (error) {
    console.error("[rate limit] 古い記録の削除に失敗しました", error);
    return 0;
  }
  return Number(data ?? 0);
}

/** 認証系の枠のうち、アドレス単位のもの(`_ip` 付きは対になる IP 単位の枠) */
type AuthRateLimitKey = Exclude<Extract<RateLimitKey, `auth_${string}`>, `${string}_ip`>;

/**
 * 認証系の制限。メールアドレスと接続元 IP の両方で数える(issue #8)。
 *
 * - アドレス単位: 1 つのアカウントへのパスワード総当たりを止める
 * - IP 単位: 1 か所から多数のアカウントを試す動きを止める
 *
 * どちらの枠も消費するので、片方だけを避ければ通る状態にはならない。
 */
export async function assertAuthRateLimit(email: string, bucket: AuthRateLimitKey): Promise<void> {
  const ipBucket = `${bucket}_ip` as RateLimitKey;
  await assertRateLimit(hashIdentifier(email), bucket);
  await assertRateLimit(await clientIp(), ipBucket);
}
