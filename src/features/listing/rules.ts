import type { ListingStatus } from "@/lib/constants";

/**
 * 出品まわりの純粋な業務ルール。
 * "use server" ファイルから同期関数を export できないため分離している。
 */

/** 出品者本人が編集できる状態(取引中・売却済・運営非表示は不可) */
export function canEditListing(status: ListingStatus): boolean {
  return status === "draft" || status === "published" || status === "withdrawn";
}

/** 公開中の商品を取下げられるか */
export function canWithdrawListing(status: ListingStatus): boolean {
  return status === "published";
}

/** 取下げた商品を再公開できるか(運営による非表示は本人が戻せない) */
export function canRepublishListing(status: ListingStatus): boolean {
  return status === "withdrawn";
}

/** 下書きの削除可否 */
export function canDeleteListing(status: ListingStatus): boolean {
  return status === "draft";
}

/** 購入可能か(FR-05 の主ボタン制御) */
export function canPurchase(status: ListingStatus): boolean {
  return status === "published";
}

/** 一覧カードに出すバッジ。null のときはバッジなし。 */
export function listingBadge(status: ListingStatus): { label: string; tone: "trading" | "sold" | "muted" } | null {
  switch (status) {
    case "trading":
      return { label: "取引中", tone: "trading" };
    case "sold":
      return { label: "SOLD", tone: "sold" };
    case "draft":
      return { label: "下書き", tone: "muted" };
    case "withdrawn":
      return { label: "取下げ中", tone: "muted" };
    case "suspended":
      return { label: "運営により非公開", tone: "muted" };
    default:
      return null;
  }
}

/**
 * 販売手数料と出品者の受取目安を計算する(表示のみ。精算処理は対象外)。
 * 端数は切り捨て。
 */
export function calcFee(price: number, feeRate: number): { fee: number; payout: number } {
  if (!Number.isFinite(price) || price <= 0) return { fee: 0, payout: 0 };
  const fee = Math.floor(price * feeRate);
  return { fee, payout: price - fee };
}
