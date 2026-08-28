import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/utils";

/**
 * クローラ向けの指示(S3-1)。
 * 会員専用の画面と管理画面はクロール対象から外す。
 */
export default function robots(): MetadataRoute.Robots {
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
