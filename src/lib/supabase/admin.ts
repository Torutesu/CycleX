import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * RLS をバイパスする service role クライアント。
 *
 * 使用してよいのは、業務ロジックの正しさをサーバーコードで担保する処理に限る:
 * - 取引ステータス遷移、Stripe Webhook 処理
 * - メッセージ INSERT / 既読更新
 * - 管理者操作(非表示化・キャンセル)
 * - 退会処理
 *
 * 呼び出し側は必ず事前に認証・認可・状態遷移のガードを行うこと。
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL が設定されていません");
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
