import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";

/**
 * DB カウント方式の簡易レート制限(ADR #10)。
 * 外部サービスを追加せず、対象テーブルの直近レコード数で判定する。
 */
type RateLimitTarget = {
  /** カウント対象テーブル */
  table: "messages" | "reports" | "listings";
  /** 所有者を示すカラム */
  ownerColumn: "sender_id" | "reporter_id" | "seller_id";
  /** 上限件数 */
  limit: number;
  /** 集計する時間窓(秒) */
  windowSeconds: number;
  /** 制限に掛かった際のメッセージ */
  message: string;
};

export const RATE_LIMITS = {
  message_send: {
    table: "messages",
    ownerColumn: "sender_id",
    limit: 10,
    windowSeconds: 60,
    message: "メッセージの送信が続いています。しばらく待ってから再度お試しください。",
  },
  report_submit: {
    table: "reports",
    ownerColumn: "reporter_id",
    limit: 5,
    windowSeconds: 60 * 60,
    message: "通報の送信が続いています。しばらく待ってから再度お試しください。",
  },
  listing_create: {
    table: "listings",
    ownerColumn: "seller_id",
    limit: 10,
    windowSeconds: 60 * 60,
    message: "短時間に多くの出品が行われています。しばらく待ってから再度お試しください。",
  },
} as const satisfies Record<string, RateLimitTarget>;

export type RateLimitKey = keyof typeof RATE_LIMITS;

/**
 * 上限を超えていれば AppError を投げる。
 * 判定に失敗した場合(DB エラー等)は通過させる — 制限は補助的な防御であり、
 * 業務処理をブロックしてはならない。
 */
export async function assertRateLimit(userId: string, key: RateLimitKey): Promise<void> {
  const config: RateLimitTarget = RATE_LIMITS[key];
  const since = new Date(Date.now() - config.windowSeconds * 1000).toISOString();
  const supabase = createAdminClient();
  const options = { count: "exact", head: true } as const;

  // テーブルごとに所有者カラムの型が異なるため、分岐して型安全にカウントする
  const result =
    config.table === "messages"
      ? await supabase
          .from("messages")
          .select("*", options)
          .eq("sender_id", userId)
          .gte("created_at", since)
      : config.table === "reports"
        ? await supabase
            .from("reports")
            .select("*", options)
            .eq("reporter_id", userId)
            .gte("created_at", since)
        : await supabase
            .from("listings")
            .select("*", options)
            .eq("seller_id", userId)
            .gte("created_at", since);

  if (result.error) return;
  if ((result.count ?? 0) >= config.limit) {
    throw new AppError(config.message);
  }
}
