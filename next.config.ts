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

  /**
   * 基本的なセキュリティヘッダ(S2-9)。
   *
   * CSP はここに入れていない。Stripe Checkout への遷移や Supabase Storage からの
   * 画像配信を誤って遮断すると決済が通らなくなるため、本番稼働後に
   * Report-Only で様子を見てから導入する。
   * HSTS は Vercel が付与するのでここでは扱わない。
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 他サイトへの iframe 埋め込みを禁じる(クリックジャッキング対策)
          { key: "X-Frame-Options", value: "DENY" },
          // Content-Type の推測を止める
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 外部サイトへは参照元をオリジンまでに留める
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 使わない端末機能は明示的に無効化する
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
          },
          // 他オリジンからの window 参照を切る
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
