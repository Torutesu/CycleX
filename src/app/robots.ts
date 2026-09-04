import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/utils";

/**
 * クローラ向けの指示(S3-1)。
 * 会員専用の画面と管理画面はクロール対象から外す。
 *
 * 関係者だけに見せる検証公開の間は `NEXT_PUBLIC_NOINDEX=1` で全面拒否にする
 * (ソースを書き換えてデプロイし直さなくて済むように)。
 */
export default function robots(): MetadataRoute.Robots {
  if (process.env.NEXT_PUBLIC_NOINDEX === "1") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api",
        "/mypage",
        "/messages",
        "/transactions",
        "/sell",
        "/purchase",
        "/login",
        "/signup",
        "/reset-password",
        "/verify-email",
        "/suspended",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
