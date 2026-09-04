import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 では `middleware` 規約が `proxy` に改称された(ランタイムは nodejs 固定)。
 * セッションのリフレッシュとルート保護を担う。
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 静的アセットと画像最適化だけを除き、それ以外の全リクエストに適用する。
     *
     * 以前は拡張子で終わるパスも一律に除いていたが、それだと
     * `/mypage/x.png` のようなパスがルート保護を通り抜ける。
     * public/ に配信対象のファイルは置いていないので、拡張子での除外はしない。
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
