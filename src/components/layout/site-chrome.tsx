"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * 管理画面は独自レイアウトを持つため、一般向けのヘッダー・タブバーを出さない。
 * ルートレイアウトは Server Component でパスを知れないので、ここで判定する。
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return <>{children}</>;
}

/** 管理画面ではタブバー分の下余白を付けない */
export function MainArea({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  return <main className={isAdmin ? undefined : "pb-20 md:pb-0"}>{children}</main>;
}
