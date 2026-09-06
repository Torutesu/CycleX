import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ListingStatus, UserStatus } from "@/lib/constants";

export type ThreadSummary = {
  id: string;
  listing: {
    id: string;
    title: string;
    price: number | null;
    status: ListingStatus;
    thumbnailPath: string | null;
  };
  counterparty: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    status: UserStatus;
  };
  lastMessage: { body: string; createdAt: string; fromMe: boolean } | null;
  unreadCount: number;
  lastMessageAt: string | null;
};

export type ThreadDetail = {
  id: string;
  buyerId: string;
  sellerId: string;
  listing: {
    id: string;
    title: string;
    price: number | null;
    status: ListingStatus;
    thumbnailPath: string | null;
  };
  counterparty: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    status: UserStatus;
  };
  messages: {
    id: string;
    body: string;
    createdAt: string;
    fromMe: boolean;
  }[];
  /** 相手からの未読があるか。既読にする通信を出すかどうかの判断に使う */
  hasUnread: boolean;
};

type ThreadRow = {
  id: string;
  buyer_id: string;
  last_message_at: string | null;
  listings: {
    id: string;
    title: string;
    price: number | null;
    status: string;
    seller_id: string;
    listing_images: { path: string; position: number }[] | null;
  } | null;
};

const THREAD_SELECT =
  "id, buyer_id, last_message_at, listings!inner(id, title, price, status, seller_id, listing_images(path, position))";

function thumbnailOf(images: { path: string; position: number }[] | null): string | null {
  if (!images || images.length === 0) return null;
  return [...images].sort((a, b) => a.position - b.position)[0].path;
}

/**
 * ヘッダー・タブバーに出す未読メッセージの合計件数。
 *
 * すべての画面で毎回引かれる。スレッドを全部集めてから
 * `thread_id=in.(...)` で数えると往復が3回に増え、やり取りが増えるほど
 * URL に ID が並んで、いずれ長さの上限に当たる。1回で数える。
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("unread_message_count", { target_user: userId });

  if (error) {
    console.error("[unread count failed]", error);
    return 0;
  }
  return Number(data ?? 0);
}

type ThreadSummaryRow = {
  thread_id: string;
  last_message_at: string | null;
  listing_id: string;
  listing_title: string;
  listing_price: number | null;
  listing_status: string;
  thumbnail_path: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  counterparty_avatar: string | null;
  counterparty_status: string | null;
  last_body: string | null;
  last_created_at: string | null;
  last_from_me: boolean | null;
  unread_count: number;
};

/**
 * M-07: スレッド一覧。最終メッセージ日時の降順。
 *
 * 最終メッセージと未読数はデータベース側で求める。
 * ここで全メッセージを引くと、やり取りが増えるほど本文を丸ごと運ぶことになる。
 */
export async function getThreadList(userId: string): Promise<ThreadSummary[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("thread_summaries", { target_user: userId });

  if (error) {
    console.error("[thread list failed]", error);
    return [];
  }

  return ((data ?? []) as ThreadSummaryRow[]).map((row) => ({
    id: row.thread_id,
    listing: {
      id: row.listing_id,
      title: row.listing_title,
      price: row.listing_price,
      status: row.listing_status as ListingStatus,
      thumbnailPath: row.thumbnail_path,
    },
    counterparty: {
      id: row.counterparty_id ?? "",
      // 退会して行ごと消えている場合がある
      displayName: row.counterparty_name ?? "退会済みユーザー",
      avatarUrl: row.counterparty_avatar,
      status: (row.counterparty_status ?? "withdrawn") as UserStatus,
    },
    lastMessage:
      row.last_body === null || row.last_created_at === null
        ? null
        : {
            body: row.last_body,
            createdAt: row.last_created_at,
            fromMe: row.last_from_me === true,
          },
    unreadCount: Number(row.unread_count),
    lastMessageAt: row.last_message_at,
  }));
}

/** M-08: スレッド詳細。参加者以外には null を返す。 */
export async function getThreadDetail(
  threadId: string,
  userId: string,
): Promise<ThreadDetail | null> {
  const supabase = createAdminClient();

  const { data: thread } = await supabase
    .from("threads")
    .select(THREAD_SELECT)
    .eq("id", threadId)
    .maybeSingle();

  const row = thread as unknown as ThreadRow | null;
  if (!row?.listings) return null;

  const sellerId = row.listings.seller_id;
  if (row.buyer_id !== userId && sellerId !== userId) return null;

  const counterpartyId = row.buyer_id === userId ? sellerId : row.buyer_id;

  const [{ data: counterparty }, { data: messages }] = await Promise.all([
    supabase
      .from("users")
      .select("id, display_name, avatar_url, status")
      .eq("id", counterpartyId)
      .maybeSingle(),
    // 直近 200 件に限定する(スレッドが長くなっても描画量が膨らまないように)
    supabase
      .from("messages")
      .select("id, sender_id, body, created_at, read_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return {
    id: row.id,
    buyerId: row.buyer_id,
    sellerId,
    listing: {
      id: row.listings.id,
      title: row.listings.title,
      price: row.listings.price,
      status: row.listings.status as ListingStatus,
      thumbnailPath: thumbnailOf(row.listings.listing_images),
    },
    counterparty: {
      id: counterpartyId,
      displayName: counterparty?.display_name ?? "退会済みユーザー",
      avatarUrl: counterparty?.avatar_url ?? null,
      status: (counterparty?.status ?? "withdrawn") as UserStatus,
    },
    hasUnread: (messages ?? []).some(
      (message) => message.sender_id !== userId && message.read_at === null,
    ),
    // 取得は新しい順(直近を優先)なので、表示用に古い順へ戻す
    messages: (messages ?? [])
      .slice()
      .reverse()
      .map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.created_at,
        fromMe: message.sender_id === userId,
      })),
  };
}

/** 商品詳細の「出品者に質問」で使う。既存スレッドがあればその ID を返す。 */
export async function findThreadByListing(
  listingId: string,
  buyerId: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("threads")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  return data?.id ?? null;
}
