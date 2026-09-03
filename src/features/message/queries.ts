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

/** 自分が参加するスレッド ID を集める(買い手として / 自分の出品として) */
async function getParticipatingThreads(userId: string): Promise<ThreadRow[]> {
  const supabase = createAdminClient();

  const [asBuyer, asSeller] = await Promise.all([
    supabase.from("threads").select(THREAD_SELECT).eq("buyer_id", userId),
    supabase.from("threads").select(THREAD_SELECT).eq("listings.seller_id", userId),
  ]);

  const merged = new Map<string, ThreadRow>();
  for (const row of [...(asBuyer.data ?? []), ...(asSeller.data ?? [])]) {
    merged.set(row.id, row as unknown as ThreadRow);
  }
  return [...merged.values()];
}

/** ヘッダー・タブバーに出す未読メッセージの合計件数 */
export async function getUnreadCount(userId: string): Promise<number> {
  const threads = await getParticipatingThreads(userId);
  if (threads.length === 0) return 0;

  const supabase = createAdminClient();
  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .in(
      "thread_id",
      threads.map((thread) => thread.id),
    )
    .neq("sender_id", userId)
    .is("read_at", null);

  return count ?? 0;
}

/** M-07: スレッド一覧。最終メッセージ日時の降順。 */
export async function getThreadList(userId: string): Promise<ThreadSummary[]> {
  const threads = await getParticipatingThreads(userId);
  if (threads.length === 0) return [];

  const supabase = createAdminClient();
  const threadIds = threads.map((thread) => thread.id);

  const [{ data: messages }, { data: users }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, thread_id, sender_id, body, read_at, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("users")
      .select("id, display_name, avatar_url, status")
      .in(
        "id",
        // 相手は「買い手」か「出品者」のいずれか
        [
          ...new Set(
            threads.flatMap((thread) =>
              [thread.buyer_id, thread.listings?.seller_id].filter(
                (id): id is string => Boolean(id) && id !== userId,
              ),
            ),
          ),
        ],
      ),
  ]);

  const userMap = new Map((users ?? []).map((user) => [user.id, user]));

  const summaries: ThreadSummary[] = threads
    .filter((thread) => thread.listings)
    .map((thread) => {
      const listing = thread.listings!;
      const counterpartyId = thread.buyer_id === userId ? listing.seller_id : thread.buyer_id;
      const counterparty = userMap.get(counterpartyId);
      const threadMessages = (messages ?? []).filter((message) => message.thread_id === thread.id);
      const latest = threadMessages[0];

      return {
        id: thread.id,
        listing: {
          id: listing.id,
          title: listing.title,
          price: listing.price,
          status: listing.status as ListingStatus,
          thumbnailPath: thumbnailOf(listing.listing_images),
        },
        counterparty: {
          id: counterpartyId,
          displayName: counterparty?.display_name ?? "退会済みユーザー",
          avatarUrl: counterparty?.avatar_url ?? null,
          status: (counterparty?.status ?? "withdrawn") as UserStatus,
        },
        lastMessage: latest
          ? { body: latest.body, createdAt: latest.created_at, fromMe: latest.sender_id === userId }
          : null,
        unreadCount: threadMessages.filter(
          (message) => message.sender_id !== userId && message.read_at === null,
        ).length,
        lastMessageAt: thread.last_message_at,
      };
    });

  return summaries.sort((a, b) => {
    const left = a.lastMessageAt ?? "";
    const right = b.lastMessageAt ?? "";
    return right.localeCompare(left);
  });
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
