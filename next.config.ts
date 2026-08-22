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
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  typedRoutes: false,
};

export default nextConfig;
