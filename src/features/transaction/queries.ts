import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ListingStatus, TransactionStatus } from "@/lib/constants";

export type TransactionDetail = {
  id: string;
  status: TransactionStatus;
  price: number;
  shippingNote: string | null;
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  canceledReason: string | null;
  buyerId: string;
  sellerId: string;
  listing: {
    id: string;
    title: string;
    price: number | null;
    status: ListingStatus;
    deliveryMethod: string | null;
    thumbnailPath: string | null;
  };
  counterparty: { id: string; displayName: string; avatarUrl: string | null };
  /** 自分がすでに評価を登録しているか */
  hasReviewed: boolean;
  /** 相手が評価を登録しているか(公開前でも件数だけは判定に使う) */
  counterpartyReviewed: boolean;
};

type TransactionRow = {
  id: string;
  status: string;
  price: number;
  shipping_note: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  canceled_reason: string | null;
  buyer_id: string;
  seller_id: string;
  listings: {
    id: string;
    title: string;
    price: number | null;
    status: string;
    delivery_method: string | null;
    listing_images: { path: string; position: number }[] | null;
  } | null;
};

const TX_SELECT = `id, status, price, shipping_note, created_at, paid_at, shipped_at, received_at,
   completed_at, canceled_at, canceled_reason, buyer_id, seller_id,
   listings!inner(id, title, price, status, delivery_method, listing_images(path, position))`;

function thumbnailOf(images: { path: string; position: number }[] | null): string | null {
  if (!images || images.length === 0) return null;
  return [...images].sort((a, b) => a.position - b.position)[0].path;
}

/** M-05: 取引画面。当事者以外には null を返す。 */
export async function getTransactionDetail(
  transactionId: string,
  userId: string,
): Promise<TransactionDetail | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("transactions")
    .select(TX_SELECT)
    .eq("id", transactionId)
    .maybeSingle();

  const row = data as unknown as TransactionRow | null;
  if (!row?.listings) return null;
  if (row.buyer_id !== userId && row.seller_id !== userId) return null;

  const counterpartyId = row.buyer_id === userId ? row.seller_id : row.buyer_id;

  const [{ data: counterparty }, { data: reviews }] = await Promise.all([
    supabase
      .from("users")
      .select("id, display_name, avatar_url")
      .eq("id", counterpartyId)
      .maybeSingle(),
    supabase.from("reviews").select("reviewer_id").eq("transaction_id", transactionId),
  ]);

  return {
    id: row.id,
    status: row.status as TransactionStatus,
    price: row.price,
    shippingNote: row.shipping_note,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    shippedAt: row.shipped_at,
    receivedAt: row.received_at,
    completedAt: row.completed_at,
    canceledAt: row.canceled_at,
    canceledReason: row.canceled_reason,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    listing: {
      id: row.listings.id,
      title: row.listings.title,
      price: row.listings.price,
      status: row.listings.status as ListingStatus,
      deliveryMethod: row.listings.delivery_method,
      thumbnailPath: thumbnailOf(row.listings.listing_images),
    },
    counterparty: {
      id: counterpartyId,
      displayName: counterparty?.display_name ?? "退会済みユーザー",
      avatarUrl: counterparty?.avatar_url ?? null,
    },
    hasReviewed: (reviews ?? []).some((review) => review.reviewer_id === userId),
    counterpartyReviewed: (reviews ?? []).some((review) => review.reviewer_id === counterpartyId),
  };
}

export type TransactionListItem = {
  id: string;
  status: TransactionStatus;
  price: number;
  createdAt: string;
  listing: { id: string; title: string; thumbnailPath: string | null };
  counterparty: { id: string; displayName: string };
  role: "buyer" | "seller";
};

/** 取引履歴で一度に取得する上限。MVP の想定規模では十分な件数。 */
const TRANSACTION_LIST_LIMIT = 100;

/** M-11: 取引履歴(購入した取引 / 出品した商品の取引) */
export async function getTransactionsFor(
  userId: string,
  role: "buyer" | "seller",
): Promise<TransactionListItem[]> {
  const supabase = createAdminClient();
  const column = role === "buyer" ? "buyer_id" : "seller_id";

  const { data } = await supabase
    .from("transactions")
    .select(TX_SELECT)
    .eq(column, userId)
    .order("created_at", { ascending: false })
    .limit(TRANSACTION_LIST_LIMIT);

  const rows = (data ?? []) as unknown as TransactionRow[];
  if (rows.length === 0) return [];

  const counterpartyIds = [
    ...new Set(rows.map((row) => (role === "buyer" ? row.seller_id : row.buyer_id))),
  ];

  const { data: users } = await supabase
    .from("users")
    .select("id, display_name")
    .in("id", counterpartyIds);

  const userMap = new Map((users ?? []).map((user) => [user.id, user.display_name]));

  return rows
    .filter((row) => row.listings)
    .map((row) => {
      const counterpartyId = role === "buyer" ? row.seller_id : row.buyer_id;
      return {
        id: row.id,
        status: row.status as TransactionStatus,
        price: row.price,
        createdAt: row.created_at,
        listing: {
          id: row.listings!.id,
          title: row.listings!.title,
          thumbnailPath: thumbnailOf(row.listings!.listing_images),
        },
        counterparty: {
          id: counterpartyId,
          displayName: userMap.get(counterpartyId) ?? "退会済みユーザー",
        },
        role,
      };
    });
}

/** 取引履歴(監査証跡)の一覧 */
export async function getTransactionEvents(transactionId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("transaction_events")
    .select("id, event, note, actor_id, created_at")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: true });
  return data ?? [];
}
