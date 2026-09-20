import { NextResponse } from "next/server";
import { getBrandOptions } from "@/features/search/queries";

/**
 * 検索窓の候補に使うメーカー一覧。
 *
 * すべての画面に検索窓があるため、共通レイアウトで毎回引くと
 * 1リクエストごとに往復が増える。入力を始めた人にだけ渡す。
 * メーカーは管理画面から時々増える程度なので、しばらく使い回す。
 */
export const revalidate = 3600;

export async function GET() {
  const brands = await getBrandOptions();
  // 候補の絞り込みはカナでも行うため、読みも一緒に渡す
  return NextResponse.json({
    brands: brands.map((brand) => ({ name: brand.name, kana: brand.kana })),
  });
}
