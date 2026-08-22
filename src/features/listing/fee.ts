import "server-only";

const DEFAULT_FEE_RATE = 0.05;

/**
 * 販売手数料率。表示のみに使用し、精算処理は本システムの対象外(別紙1 3.(4))。
 * 不正な設定値のときは既定値にフォールバックする。
 */
export function getPlatformFeeRate(): number {
  const raw = Number(process.env.PLATFORM_FEE_RATE);
  if (!Number.isFinite(raw) || raw < 0 || raw >= 1) return DEFAULT_FEE_RATE;
  return raw;
}
