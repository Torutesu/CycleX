import type { NextConfig } from "next";

// Supabase Storage の公開 URL / 画像変換 URL を next/image に許可する。
// ビルド時に未設定だと本番で全画像が拒否されるので、黙って 127.0.0.1 に落とさない
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL がビルド環境に設定されていません");
}
const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;

/**
 * Content-Security-Policy(issue #11)。
 *
 * まず Report-Only で出す。誤って遮断すると決済が通らなくなる経路
 * (Stripe Checkout への遷移、Supabase Storage からの画像配信)があるため、
 * 違反の実績を見てから強制モードへ切り替える。
 *
 * 許可オリジンと理由:
 * - `js.stripe.com`      : Checkout のリダイレクト前に読み込む Stripe.js
 * - `*.stripe.com`       : Checkout の iframe と API への通信
 * - Supabase のホスト     : 商品画像・アバターの配信と PostgREST / Auth への通信
 * - `*.googleusercontent.com` : Google ログイン利用者のプロフィール画像
 * - `fonts.gstatic.com`  : next/font が自己ホストしきれない場合の保険
 *
 * `script-src` に `'unsafe-inline'` を含めている。App Router が
 * ブートストラップ用のインラインスクリプトを出すためで、これを外すには
 * proxy.ts で nonce を発行して各リクエストに埋める必要がある。
 * 強制モードへ移す前に nonce 方式へ替えること(それまでは XSS 緩和の効果が薄い)。
 */
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cspReportOnly = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://js.stripe.com`,
  // Tailwind と next/font がインラインで style を出す
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${supabaseOrigin} https://*.googleusercontent.com`,
  `connect-src 'self' ${supabaseOrigin} https://api.stripe.com`,
  "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  // 埋め込みも Flash 等のプラグインも使わない
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/**" },
      { protocol: "http", hostname: supabaseHost, pathname: "/storage/v1/**" },
      { protocol: "http", hostname: "127.0.0.1", pathname: "/storage/v1/**" },
      // Google ログイン利用時のプロフィール画像(lh3 以外のサブドメインでも配られる)
      { protocol: "https", hostname: "**.googleusercontent.com" },
    ],
    // 画像のパスは UUID で不変なので、最適化結果を長く持たせて再変換のコストを抑える
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // ローカルの Supabase は 127.0.0.1 で動くため、開発時のみ private IP を許可する。
    // 本番の Supabase は公開ホストなので、この緩和は不要かつ有効化しない。
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
  },
  typedRoutes: false,

  /**
   * 基本的なセキュリティヘッダ(S2-9)。
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
          // XSS の影響範囲を絞る(issue #11)。まずは Report-Only で観測する
          { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
        ],
      },
    ];
  },
};

export default nextConfig;
