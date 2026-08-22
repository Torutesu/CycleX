import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { AdminNav, AdminNavDrawer } from "@/features/admin/components/admin-nav";

export const metadata: Metadata = {
  title: { default: "管理画面", template: "%s | CycleX 管理画面" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts に加えた二重チェック(権限がなければ 404)
  const admin = await requireAdmin();

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="flex h-14 items-center gap-3 px-4">
          <AdminNavDrawer />
          <Link href="/admin" className="font-bold">
            CycleX <span className="text-muted-foreground">管理画面</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {admin.displayName}
            </span>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              サイトへ
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20">
            <AdminNav />
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
