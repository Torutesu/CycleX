import type { NextConfig } from "next";

// Supabase Storage の公開 URL / 画像変換 URL を next/image に許可する
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "127.0.0.1";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/**" },
      { protocol: "http", hostname: supabaseHost, pathname: "/storage/v1/**" },
      { protocol: "http", hostname: "127.0.0.1", pathname: "/storage/v1/**" },
      // Google ログイン利用時のプロフィール画像
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
    // ローカルの Supabase は 127.0.0.1 で動くため、開発時のみ private IP を許可する。
    // 本番の Supabase は公開ホストなので、この緩和は不要かつ有効化しない。
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
  },
  typedRoutes: false,
};

export default nextConfig;
