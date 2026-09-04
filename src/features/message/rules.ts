import type { ListingStatus, UserStatus } from "@/lib/constants";

/**
 * メッセージ送信可否の純粋な判定(FR-07)。
 * 参加者であること、相手が応答可能な状態であることを確認する。
 */
export type ThreadContext = {
  buyerId: string;
  sellerId: string;
  counterpartyStatus: UserStatus;
  /** やり取りの対象商品の状態 */
  listingStatus: ListingStatus;
};

export type SendCheck = { allowed: true } | { allowed: false; reason: string };

export function canSendMessage(viewerId: string, thread: ThreadContext): SendCheck {
  if (viewerId !== thread.buyerId && viewerId !== thread.sellerId) {
    return { allowed: false, reason: "このやり取りに参加していません。" };
  }
  if (thread.counterpartyStatus === "withdrawn") {
    return { allowed: false, reason: "相手が退会済みのため、メッセージを送信できません。" };
  }
  if (thread.counterpartyStatus === "suspended") {
    return {
      allowed: false,
      reason: "相手のアカウントが利用停止中のため、メッセージを送信できません。",
    };
  }
  // 運営が非表示にした商品では新規のやり取りを止める(質問の開始を塞ぐ canStartThread と対称)。
  // 取下げ・売却済みは当事者の都合なので、進行中の連絡は続けられるようにする
  if (thread.listingStatus === "suspended") {
    return {
      allowed: false,
      reason: "この商品は運営により非公開のため、メッセージを送信できません。",
    };
  }
  return { allowed: true };
}

/** 送信できない理由(画面の入力欄を閉じるときの案内文)。送信できるなら null */
export function sendDisabledReason(
  counterpartyStatus: UserStatus,
  listingStatus: ListingStatus,
): string | null {
  const check = canSendMessage("viewer", {
    buyerId: "viewer",
    sellerId: "other",
    counterpartyStatus,
    listingStatus,
  });
  return check.allowed ? null : check.reason;
}

/** スレッドを開始できる商品の状態か(下書き・取下げ・非表示には問い合わせできない) */
export function canStartThread(
  listingStatus: ListingStatus,
  sellerId: string,
  viewerId: string,
): SendCheck {
  if (sellerId === viewerId) {
    return { allowed: false, reason: "自分が出品した商品には質問できません。" };
  }
  if (!["published", "trading", "sold"].includes(listingStatus)) {
    return { allowed: false, reason: "この商品は現在やり取りできません。" };
  }
  return { allowed: true };
}

/** スレッド内での自分の役割 */
export function roleInThread(
  viewerId: string,
  thread: { buyerId: string; sellerId: string },
): "buyer" | "seller" | null {
  if (viewerId === thread.buyerId) return "buyer";
  if (viewerId === thread.sellerId) return "seller";
  return null;
}
