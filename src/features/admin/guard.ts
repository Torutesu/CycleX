import "server-only";

import { getCurrentUser, type SessionUser } from "@/lib/session";
import { AppError } from "@/lib/errors";

/**
 * 管理系 Server Action の入口で必ず呼ぶ権限チェック。
 * proxy.ts のルート保護に加えた二重化(ADR #3)。
 */
export async function requireAdminAction(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || user.status !== "active") {
    throw new AppError("この操作を行う権限がありません。");
  }
  return user;
}
