import "server-only";

import { createClient } from "@/lib/supabase/server";

export type PublicProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  prefecture: string | null;
  status: "active" | "suspended" | "withdrawn";
  createdAt: string;
};

export type RatingSummary = {
  average: number | null;
  count: number;
};

/**
 * 公開プロフィールを取得する。
 * 利用停止ユーザーは一般ユーザーに見せない(呼び出し側で notFound する)。
 */
export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, display_name, avatar_url, bio, prefecture, status, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    prefecture: data.prefecture,
    status: data.status as PublicProfile["status"],
    createdAt: data.created_at,
  };
}

/** 公開済み・非表示でない評価から平均★と件数を求める(FR-10) */
export async function getRatingSummary(userId: string): Promise<RatingSummary> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("rating")
    .eq("reviewee_id", userId)
    .eq("is_published", true)
    .eq("is_hidden", false);

  if (!data || data.length === 0) return { average: null, count: 0 };

  const total = data.reduce((sum, review) => sum + review.rating, 0);
  return {
    average: Math.round((total / data.length) * 10) / 10,
    count: data.length,
  };
}

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewer: { id: string; displayName: string; avatarUrl: string | null } | null;
};

/** プロフィールに表示する受け取った評価の一覧 */
export async function getPublishedReviews(
  userId: string,
  limit = 20,
): Promise<PublicReview[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at, reviewer:users!reviews_reviewer_id_fkey(id, display_name, avatar_url)")
    .eq("reviewee_id", userId)
    .eq("is_published", true)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.map((review) => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.created_at,
    reviewer: review.reviewer
      ? {
          id: review.reviewer.id,
          displayName: review.reviewer.display_name,
          avatarUrl: review.reviewer.avatar_url,
        }
      : null,
  }));
}
