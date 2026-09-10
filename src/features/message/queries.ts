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

/** スレッド一覧の 1 ページ分。RPC 側の上限(200)に収める */
export const THREAD_PAGE_SIZE = 50;

/**
 * 自分が参加するスレッドを集める(買い手として / 自分の出品として)。
 *
 * 順序も上限も付けずに引くと、PostgREST の行上限(既定 1,000)を超えた分が
 * 黙って落ちる。しかも順序が不定なのでどれが落ちるかも分からない(監査 M-6)。
 * 両方を最終メッセージの新しい順で `take` 件だけ取り、合わせてから並べ直す。
 * 片側ごとの上位 take 件の和集合には、全体の上位 take 件が必ず含まれる。
 */
async function getParticipatingThreads(userId: string, take: number): Promise<ThreadRow[]> {
  const supabase = createAdminClient();
  const order = { ascending: false, nullsFirst: false } as const;

  const [asBuyer, asSeller] = await Promise.all([
    supabase
      .from("threads")
      .select(THREAD_SELECT)
      .eq("buyer_id", userId)
      .order("last_message_at", order)
      .limit(take),
    supabase
      .from("threads")
      .select(THREAD_SELECT)
      .eq("listings.seller_id", userId)
      .order("last_message_at", order)
      .limit(take),
  ]);

  const merged = new Map<string, ThreadRow>();
  for (const row of [...(asBuyer.data ?? []), ...(asSeller.data ?? [])]) {
    merged.set(row.id, row as unknown as ThreadRow);
  }
  return [...merged.values()];
}

/** ヘッダー・タブバーに出す未読メッセージの合計件数(SQL 側で 1 回で数える) */
export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("unread_message_count", { p_user: userId });
  if (error) {
    console.error("[unread count failed]", error);
    return 0;
  }
  return Number(data ?? 0);
}

export type ThreadListPage = {
  threads: ThreadSummary[];
  /** まだ続きがあるか(「さらに読み込む」の出し分け) */
  hasMore: boolean;
};

/**
 * M-07: スレッド一覧。最終メッセージ日時の降順。
 *
 * 最終メッセージと未読数は `thread_summaries` 関数で集計する。
 * アプリ側で全メッセージを数える方式は PostgREST の 1,000 行上限を超えると
 * 古いスレッドの本文・未読が黙って欠落していた。
 *
 * 一覧そのものも同じ上限に当たるため、`page` ページ目までをまとめて返す
 * (1 ページ 50 件の積み上げ式。監査 M-6)。
 */
export async function getThreadList(userId: string, page = 1): Promise<ThreadListPage> {
  const wanted = Math.max(1, page) * THREAD_PAGE_SIZE;
  // 続きがあるかを知るために 1 件だけ多く取る
  const threads = await getParticipatingThreads(userId, wanted + 1);
  if (threads.length === 0) return { threads: [], hasMore: false };

  const supabase = createAdminClient();

  const [{ data: summaries, error }, { data: users }] = await Promise.all([
    supabase.rpc("thread_summaries", { p_user: userId, p_limit: wanted + 1, p_offset: 0 }),
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
  if (error) console.error("[thread summaries failed]", error);

  const userMap = new Map((users ?? []).map((user) => [user.id, user]));
  const summaryMap = new Map((summaries ?? []).map((row) => [row.thread_id, row]));

  const result: ThreadSummary[] = threads
    .filter((thread) => thread.listings)
    .map((thread) => {
      const listing = thread.listings!;
      const counterpartyId = thread.buyer_id === userId ? listing.seller_id : thread.buyer_id;
      const counterparty = userMap.get(counterpartyId);
      const summary = summaryMap.get(thread.id);

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
        lastMessage:
          summary?.last_body && summary.last_created_at
            ? {
                body: summary.last_body,
                createdAt: summary.last_created_at,
                fromMe: summary.last_sender_id === userId,
              }
            : null,
        unreadCount: Number(summary?.unread_count ?? 0),
        lastMessageAt: thread.last_message_at,
      };
    });

  const sorted = result.sort((a, b) => {
    const left = a.lastMessageAt ?? "";
    const right = b.lastMessageAt ?? "";
    // 同着はスレッド ID で安定させる(SQL 側の並びと揃える)
    return right.localeCompare(left) || a.id.localeCompare(b.id);
  });

  return { threads: sorted.slice(0, wanted), hasMore: sorted.length > wanted };
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
