import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import type { ListingStatus, TransactionStatus } from "@/lib/constants";
import type { Database } from "@/types/database";
import {
  canTransition,
  listingStatusFor,
  timestampColumnFor,
  type TxRole,
} from "@/features/transaction/state";

export type TransactionRecord = {
  id: string;
  listingId: string;
  sellerId: string;
  buyerId: string;
  status: TransactionStatus;
  price: number;
  shippingNote: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  canceledReason: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  listing_id: string;
  seller_id: string;
  buyer_id: string;
  status: string;
  price: number;
  shipping_note: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  canceled_reason: string | null;
  created_at: string;
};

export function toTransaction(row: Row): TransactionRecord {
  return {
    id: row.id,
    listingId: row.listing_id,
    sellerId: row.seller_id,
    buyerId: row.buyer_id,
    status: row.status as TransactionStatus,
    price: row.price,
    shippingNote: row.shipping_note,
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    paidAt: row.paid_at,
    shippedAt: row.shipped_at,
    receivedAt: row.received_at,
    completedAt: row.completed_at,
    canceledAt: row.canceled_at,
    canceledReason: row.canceled_reason,
    createdAt: row.created_at,
  };
}

export async function getTransaction(id: string): Promise<TransactionRecord | null> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  return data ? toTransaction(data as Row) : null;
}

/** 取引履歴(監査証跡)を記録する */
export async function recordEvent(
  transactionId: string,
  event: string,
  actorId: string | null,
  note?: string,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("transaction_events").insert({
    transaction_id: transactionId,
    actor_id: actorId,
    event,
    note: note ?? null,
  });
}

type TransactionUpdate = Database["public"]["Tables"]["transactions"]["Update"];

export type TransitionOptions = {
  /** 追加で更新するカラム */
  patch?: TransactionUpdate;
  /** 履歴に残すメモ */
  note?: string;
  /** 操作者。system の場合は null */
  actorId?: string | null;
};

/**
 * 取引ステータスを遷移させ、商品の状態と履歴を同時に更新する。
 * 遷移の可否は必ず state.ts の遷移表で判定する。
 */
export async function transitionTransaction(
  transaction: TransactionRecord,
  to: TransactionStatus,
  role: TxRole,
  options: TransitionOptions = {},
): Promise<TransactionRecord> {
  if (!canTransition(transaction.status, to, role)) {
    throw new AppError("現在の状態ではこの操作は行えません。画面を更新してご確認ください。");
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const timestampColumn = timestampColumnFor(to);

  const patch: TransactionUpdate = {
    status: to,
    ...(timestampColumn ? { [timestampColumn]: now } : {}),
    ...options.patch,
  };

  // 遷移前の状態を条件に含め、同時実行での二重遷移を防ぐ
  const { data, error } = await supabase
    .from("transactions")
    .update(patch)
    .eq("id", transaction.id)
    .eq("status", transaction.status)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[transaction transition failed]", error);
    throw new AppError("取引の更新に失敗しました。時間をおいて再度お試しください。");
  }
  if (!data) {
    throw new AppError("取引の状態が変化しています。画面を更新してご確認ください。");
  }

  await syncListingStatus(transaction.listingId, to);
  await recordEvent(transaction.id, to, options.actorId ?? null, options.note);

  return toTransaction(data as Row);
}

/** 取引ステータスに応じて商品の状態を追従させる */
export async function syncListingStatus(
  listingId: string,
  txStatus: TransactionStatus,
): Promise<void> {
  const supabase = createAdminClient();
  const { data: listing } = await supabase
    .from("listings")
    .select("status")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing) return;

  const next = listingStatusFor(txStatus, listing.status as ListingStatus);
  if (!next || next === listing.status) return;

  await supabase.from("listings").update({ status: next }).eq("id", listingId);
}
