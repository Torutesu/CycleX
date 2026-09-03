import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_PAGE_SIZE, type ListingStatus, type TransactionStatus } from "@/lib/constants";
import { detectStateMismatch } from "@/features/admin/rules";
import { jstDateKey, startOfJstDay } from "@/lib/utils";

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
};

function range(page: number): [number, number] {
  const from = (page - 1) * ADMIN_PAGE_SIZE;
  return [from, from + ADMIN_PAGE_SIZE - 1];
}

function paged<T>(items: T[], total: number, page: number): Paged<T> {
  return {
    items,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
  };
}

/** ILIKE のワイルドカードを無効化する */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (match) => `\\${match}`).replace(/[,()]/g, " ");
}

// ============================================================
// 利用者(AD-02)
// ============================================================

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  status: string;
  createdAt: string;
  listingCount: number;
  transactionCount: number;
};

export async function listUsers(options: {
  query?: string;
  status?: string;
  page: number;
}): Promise<Paged<AdminUserRow>> {
  const supabase = createAdminClient();
  const [from, to] = range(options.page);

  let builder = supabase
    .from("users")
    .select("id, email, display_name, avatar_url, role, status, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (options.query) {
    const pattern = `%${escapeLike(options.query)}%`;
    builder = builder.or(`display_name.ilike.${pattern},email.ilike.${pattern}`);
  }
  if (options.status) builder = builder.eq("status", options.status);

  const { data, count } = await builder.range(from, to);
  const rows = data ?? [];

  // 一覧に出す件数は行ごとに集計する(件数は最大20件なので許容範囲)
  const items = await Promise.all(
    rows.map(async (row) => {
      const [{ count: listingCount }, { count: transactionCount }] = await Promise.all([
        supabase
          .from("listings")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", row.id),
        supabase
          .from("transactions")
          .select("*", { count: "exact", head: true })
          .or(`buyer_id.eq.${row.id},seller_id.eq.${row.id}`),
      ]);

      return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        role: row.role,
        status: row.status,
        createdAt: row.created_at,
        listingCount: listingCount ?? 0,
        transactionCount: transactionCount ?? 0,
      };
    }),
  );

  return paged(items, count ?? 0, options.page);
}

export async function getUserDetail(userId: string) {
  const supabase = createAdminClient();

  const [{ data: user }, { data: listings }, { data: transactions }, { data: reviews }, { data: reports }] =
    await Promise.all([
      supabase.from("users").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("listings")
        .select("id, title, status, price, created_at")
        .eq("seller_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("transactions")
        .select("id, status, price, created_at, buyer_id, seller_id, listings(title)")
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("reviews")
        .select("id, rating, comment, is_published, is_hidden, created_at")
        .eq("reviewee_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("reports")
        .select("id, reason, detail, status, created_at")
        .eq("target_type", "user")
        .eq("target_id", userId)
        .order("created_at", { ascending: false }),
    ]);

  if (!user) return null;

  return { user, listings: listings ?? [], transactions: transactions ?? [], reviews: reviews ?? [], reports: reports ?? [] };
}

// ============================================================
// 出品(AD-03)
// ============================================================

export type AdminListingRow = {
  id: string;
  title: string;
  price: number | null;
  status: string;
  category: string;
  createdAt: string;
  publishedAt: string | null;
  thumbnailPath: string | null;
  seller: { id: string; displayName: string } | null;
  reportCount: number;
};

export async function listListings(options: {
  query?: string;
  status?: string;
  category?: string;
  page: number;
}): Promise<Paged<AdminListingRow>> {
  const supabase = createAdminClient();
  const [from, to] = range(options.page);

  let builder = supabase
    .from("listings")
    .select(
      "id, title, price, status, category, created_at, published_at, listing_images(path, position), seller:users!listings_seller_id_fkey(id, display_name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (options.query) {
    builder = builder.ilike("title", `%${escapeLike(options.query)}%`);
  }
  if (options.status) builder = builder.eq("status", options.status);
  if (options.category) builder = builder.eq("category", options.category);

  const { data, count } = await builder.range(from, to);
  const rows = data ?? [];

  const reportCounts = await Promise.all(
    rows.map(async (row) => {
      const { count: reportCount } = await supabase
        .from("reports")
        .select("*", { count: "exact", head: true })
        .eq("target_type", "listing")
        .eq("target_id", row.id);
      return reportCount ?? 0;
    }),
  );

  const items: AdminListingRow[] = rows.map((row, index) => {
    const images = row.listing_images ?? [];
    const thumbnail = [...images].sort((a, b) => a.position - b.position)[0];
    return {
      id: row.id,
      title: row.title,
      price: row.price,
      status: row.status,
      category: row.category,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      thumbnailPath: thumbnail?.path ?? null,
      seller: row.seller ? { id: row.seller.id, displayName: row.seller.display_name } : null,
      reportCount: reportCounts[index],
    };
  });

  return paged(items, count ?? 0, options.page);
}

// ============================================================
// 取引(AD-04)
// ============================================================

export type AdminTransactionRow = {
  id: string;
  status: string;
  price: number;
  createdAt: string;
  paidAt: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  listing: { id: string; title: string } | null;
  buyer: { id: string; displayName: string } | null;
  seller: { id: string; displayName: string } | null;
};

export async function listTransactions(options: {
  query?: string;
  status?: string;
  /** "pending" のとき、返金対応が必要な取引のみに絞る */
  refund?: string;
  from?: string;
  to?: string;
  page: number;
}): Promise<Paged<AdminTransactionRow>> {
  const supabase = createAdminClient();
  const [rangeFrom, rangeTo] = range(options.page);

  let builder = supabase
    .from("transactions")
    .select(
      `id, status, price, created_at, paid_at, stripe_session_id, stripe_payment_intent_id,
       listings!inner(id, title),
       buyer:users!transactions_buyer_id_fkey(id, display_name),
       seller:users!transactions_seller_id_fkey(id, display_name)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (options.query) {
    builder = builder.ilike("listings.title", `%${escapeLike(options.query)}%`);
  }
  if (options.status) builder = builder.eq("status", options.status);
  // 入金済みのままキャンセルされた取引 = 運営の手動返金が必要なもの
  if (options.refund === "pending") {
    builder = builder.eq("status", "canceled").not("paid_at", "is", null);
  }
  if (options.from) builder = builder.gte("created_at", options.from);
  if (options.to) builder = builder.lte("created_at", `${options.to}T23:59:59`);

  const { data, count } = await builder.range(rangeFrom, rangeTo);

  const items: AdminTransactionRow[] = (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    price: row.price,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    listing: row.listings ? { id: row.listings.id, title: row.listings.title } : null,
    buyer: row.buyer ? { id: row.buyer.id, displayName: row.buyer.display_name } : null,
    seller: row.seller ? { id: row.seller.id, displayName: row.seller.display_name } : null,
  }));

  return paged(items, count ?? 0, options.page);
}

/**
 * 返金対応が必要な取引の件数。
 * 管理画面の導線に出し、手動返金の取りこぼしを防ぐ。
 */
export async function countRefundPending(): Promise<number> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("status", "canceled")
    .not("paid_at", "is", null);

  return count ?? 0;
}

// ============================================================
// 通報(AD-05)
// ============================================================

export type AdminReportRow = {
  id: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  reason: string;
  detail: string | null;
  status: string;
  createdAt: string;
  resolvedNote: string | null;
  reporter: { id: string; displayName: string } | null;
};

export async function listReports(options: {
  status?: string;
  targetType?: string;
  page: number;
}): Promise<Paged<AdminReportRow>> {
  const supabase = createAdminClient();
  const [from, to] = range(options.page);

  let builder = supabase
    .from("reports")
    .select(
      "id, target_type, target_id, reason, detail, status, created_at, resolved_note, reporter:users!reports_reporter_id_fkey(id, display_name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (options.status) builder = builder.eq("status", options.status);
  if (options.targetType) builder = builder.eq("target_type", options.targetType);

  const { data, count } = await builder.range(from, to);
  const rows = data ?? [];

  // 対象の名称を引く(商品はタイトル、利用者は表示名)
  const listingIds = rows.filter((r) => r.target_type === "listing").map((r) => r.target_id);
  const userIds = rows.filter((r) => r.target_type === "user").map((r) => r.target_id);

  const [{ data: listings }, { data: users }] = await Promise.all([
    listingIds.length > 0
      ? supabase.from("listings").select("id, title").in("id", listingIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    userIds.length > 0
      ? supabase.from("users").select("id, display_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
  ]);

  const listingMap = new Map((listings ?? []).map((l) => [l.id, l.title]));
  const userMap = new Map((users ?? []).map((u) => [u.id, u.display_name]));

  const items: AdminReportRow[] = rows.map((row) => ({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel:
      row.target_type === "listing"
        ? (listingMap.get(row.target_id) ?? "(削除された商品)")
        : (userMap.get(row.target_id) ?? "(削除された利用者)"),
    reason: row.reason,
    detail: row.detail,
    status: row.status,
    createdAt: row.created_at,
    resolvedNote: row.resolved_note,
    reporter: row.reporter
      ? { id: row.reporter.id, displayName: row.reporter.display_name }
      : null,
  }));

  return paged(items, count ?? 0, options.page);
}

// ============================================================
// ブランド(AD-06)
// ============================================================

export async function listBrands() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("brands")
    .select("id, name, is_active, created_at")
    .order("name");
  return data ?? [];
}

// ============================================================
// 整合性チェック(S2-7)
// ============================================================

export type StateMismatch = {
  transactionId: string;
  transactionStatus: string;
  listingId: string;
  listingTitle: string;
  listingStatus: string;
  reason: string;
};

/** 一度に持ち帰る件数の上限(ダッシュボードに出す用途なので多くは要らない) */
const MISMATCH_LIMIT = 50;

/**
 * 取引と商品の状態が食い違っている行を探す。
 *
 * 状態遷移は「取引の更新 → 商品の更新 → 履歴の記録」を別々に実行しているため、
 * 途中でプロセスが落ちるとズレが残る。起きたときに気づけるよう日次で照合する。
 *
 * 走査量を抑えるため、ズレが起こりうる組み合わせだけを DB 側で絞り込む。
 */
export async function findStateMismatches(): Promise<StateMismatch[]> {
  const supabase = createAdminClient();
  const select = "id, status, listings!inner(id, title, status)";

  const [inProgress, completed, canceled] = await Promise.all([
    // 決済後〜受取確認までは商品が「取引中」であるはず
    supabase
      .from("transactions")
      .select(select)
      .in("status", ["paid", "shipped", "received"])
      .neq("listings.status", "trading")
      .limit(MISMATCH_LIMIT),
    // 完了した取引の商品は「売却済」であるはず
    supabase
      .from("transactions")
      .select(select)
      .eq("status", "completed")
      .neq("listings.status", "sold")
      .limit(MISMATCH_LIMIT),
    // キャンセルされた取引の商品が「取引中」のまま残っていないか
    supabase
      .from("transactions")
      .select(select)
      .eq("status", "canceled")
      .eq("listings.status", "trading")
      .limit(MISMATCH_LIMIT),
  ]);

  const rows = [
    ...(inProgress.data ?? []),
    ...(completed.data ?? []),
    ...(canceled.data ?? []),
  ];

  const mismatches: StateMismatch[] = [];

  for (const row of rows) {
    if (!row.listings) continue;
    const reason = detectStateMismatch(
      row.status as TransactionStatus,
      row.listings.status as ListingStatus,
    );
    if (!reason) continue;

    mismatches.push({
      transactionId: row.id,
      transactionStatus: row.status,
      listingId: row.listings.id,
      listingTitle: row.listings.title,
      listingStatus: row.listings.status,
      reason,
    });
  }

  return mismatches;
}

// ============================================================
// ダッシュボード(AD-01)
// ============================================================

export type DashboardStats = {
  userCount: number;
  listingCount: number;
  transactionCount: number;
  gmv: number;
  openReportCount: number;
  daily: { date: string; users: number; listings: number; transactions: number }[];
};

export async function getDashboardStats(days = 30): Promise<DashboardStats> {
  const supabase = createAdminClient();
  // 日本時間の日付で数える。UTC の日付で束ねると、朝9時までの分が前日に積まれる
  const today = startOfJstDay();
  const since = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  const [
    { count: userCount },
    { count: listingCount },
    { count: transactionCount },
    { data: completed },
    { count: openReportCount },
    { data: recentUsers },
    { data: recentListings },
    { data: recentTransactions },
  ] = await Promise.all([
    supabase.from("users").select("*", { count: "exact", head: true }).neq("status", "withdrawn"),
    supabase.from("listings").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .neq("status", "pending_payment")
      .neq("status", "canceled"),
    supabase.from("transactions").select("price").eq("status", "completed"),
    supabase.from("reports").select("*", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("users").select("created_at").gte("created_at", sinceIso),
    supabase.from("listings").select("published_at").gte("published_at", sinceIso),
    supabase.from("transactions").select("paid_at").gte("paid_at", sinceIso),
  ]);

  // 日別に集計する(件数が限られるためアプリ側で行う)
  const buckets = new Map<string, { users: number; listings: number; transactions: number }>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = jstDateKey(new Date(today.getTime() - i * 24 * 60 * 60 * 1000));
    buckets.set(date, { users: 0, listings: 0, transactions: 0 });
  }

  const bump = (iso: string | null, key: "users" | "listings" | "transactions") => {
    if (!iso) return;
    const bucket = buckets.get(jstDateKey(iso));
    if (bucket) bucket[key] += 1;
  };

  for (const row of recentUsers ?? []) bump(row.created_at, "users");
  for (const row of recentListings ?? []) bump(row.published_at, "listings");
  for (const row of recentTransactions ?? []) bump(row.paid_at, "transactions");

  return {
    userCount: userCount ?? 0,
    listingCount: listingCount ?? 0,
    transactionCount: transactionCount ?? 0,
    gmv: (completed ?? []).reduce((sum, row) => sum + row.price, 0),
    openReportCount: openReportCount ?? 0,
    daily: [...buckets.entries()].map(([date, value]) => ({ date, ...value })),
  };
}

/** ダッシュボードの「最近の通報 / 取引」 */
export async function getRecentActivity() {
  const [reports, transactions] = await Promise.all([
    listReports({ page: 1 }),
    listTransactions({ page: 1 }),
  ]);
  return {
    reports: reports.items.slice(0, 5),
    transactions: transactions.items.slice(0, 5),
  };
}
