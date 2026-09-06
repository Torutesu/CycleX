import "server-only";

import { envValue } from "@/lib/env";

const DEFAULT_FEE_RATE = 0.07;

/**
 * 販売手数料率。表示のみに使用し、精算処理は本システムの対象外(別紙1 3.(4))。
 * 不正な設定値のときは既定値にフォールバックする。
 */
export function getPlatformFeeRate(): number {
  // Number("") は 0 になるため、空のまま登録すると手数料 0% になってしまう
  const configured = envValue("PLATFORM_FEE_RATE");
  if (!configured) return DEFAULT_FEE_RATE;

  const raw = Number(configured);
  if (!Number.isFinite(raw) || raw < 0 || raw >= 1) return DEFAULT_FEE_RATE;
  return raw;
}
