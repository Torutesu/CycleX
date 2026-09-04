import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 検索窓の候補に使うブランド一覧。
 *
 * すべての画面に検索窓があるため、共通レイアウトで毎回引くと
 * 1リクエストごとに往復が増える。入力を始めた人にだけ渡す。
 * ブランドは管理画面から時々増える程度なので、しばらく使い回す。
 */
// ルート自体はビルド時に固定しない(ビルド環境から DB へは繋がない)。
// データだけを 1 時間キャッシュする
export const dynamic = "force-dynamic";

const getBrandNames = unstable_cache(
  async () => {
    const { data } = await createAdminClient()
      .from("brands")
      .select("name")
      .eq("is_active", true)
      .order("name");
    return (data ?? []).map((brand) => brand.name);
  },
  ["brand-names"],
  { revalidate: 3600, tags: ["brands"] },
);

export async function GET() {
  return NextResponse.json({ brands: await getBrandNames() });
}
