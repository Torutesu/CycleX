import type { ListingStatus, TransactionStatus } from "@/lib/constants";

/**
 * 取引ステータスの遷移表(FR-08)。
 *
 * すべての Server Action・Stripe Webhook・日次バッチはこのモジュールの
 * `canTransition` を必ず通してから DB を更新する。
 */

export type TxRole = "buyer" | "seller" | "admin" | "system";

/** from → { to: 実行を許可するロール } */
const TRANSITIONS: Record<TransactionStatus, Partial<Record<TransactionStatus, TxRole[]>>> = {
  // 決済確定は Stripe Webhook(system)のみ。成功画面への戻りでは成立させない。
  pending_payment: {
    paid: ["system"],
    canceled: ["system", "admin"],
  },
  paid: {
    shipped: ["seller"],
    canceled: ["admin"],
  },
  shipped: {
    received: ["buyer"],
    canceled: ["admin"],
  },
  // 完了は双方の評価が揃った時点(または14日経過)にシステムが行う
  received: {
    completed: ["system"],
    canceled: ["admin"],
  },
  completed: {},
  canceled: {},
};

export function canTransition(
  from: TransactionStatus,
  to: TransactionStatus,
  role: TxRole,
): boolean {
  const allowed = TRANSITIONS[from]?.[to];
  return Boolean(allowed?.includes(role));
}

/** 遷移先として指定できるステータスの一覧(管理画面の操作可否表示に使う) */
export function allowedTransitions(from: TransactionStatus, role: TxRole): TransactionStatus[] {
  const entries = TRANSITIONS[from] ?? {};
  return (Object.keys(entries) as TransactionStatus[]).filter((to) => entries[to]?.includes(role));
}

export type NextAction = "pay" | "ship" | "receive" | "review" | "wait" | null;

/**
 * 取引画面で「次に何をすべきか」を決める。
 * wait は相手の操作待ち、null は操作不要(完了・キャンセル)。
 */
export function nextActionFor(
  status: TransactionStatus,
  role: "buyer" | "seller",
  hasReviewed = false,
): NextAction {
  switch (status) {
    case "pending_payment":
      return role === "buyer" ? "pay" : "wait";
    case "paid":
      return role === "seller" ? "ship" : "wait";
    case "shipped":
      return role === "buyer" ? "receive" : "wait";
    case "received":
      return hasReviewed ? "wait" : "review";
    case "completed":
    case "canceled":
      return null;
  }
}

/** 取引ステータスに連動して商品をどの状態にするか(null は変更なし) */
export function listingStatusFor(
  txStatus: TransactionStatus,
  currentListingStatus: ListingStatus,
): ListingStatus | null {
  switch (txStatus) {
    case "paid":
      return "trading";
    case "completed":
      return "sold";
    case "canceled":
      // 取引中だった商品のみ販売中へ戻す(売却済・非表示はそのまま)
      return currentListingStatus === "trading" ? "published" : null;
    default:
      return null;
  }
}

/** ステータス変更時に打刻するカラム */
export function timestampColumnFor(status: TransactionStatus): string | null {
  switch (status) {
    case "paid":
      return "paid_at";
    case "shipped":
      return "shipped_at";
    case "received":
      return "received_at";
    case "completed":
      return "completed_at";
    case "canceled":
      return "canceled_at";
    default:
      return null;
  }
}

/** 進行中(排他対象)の取引か */
export function isActiveTransaction(status: TransactionStatus): boolean {
  return status !== "completed" && status !== "canceled";
}
