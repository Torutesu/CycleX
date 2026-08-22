import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";
import { getTransactionsFor } from "@/features/transaction/queries";
import { TransactionList } from "@/features/transaction/components/transaction-list";
import { isActiveTransaction } from "@/features/transaction/state";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "出品した商品の取引" };

const TABS = [
  { value: "active", label: "進行中" },
  { value: "completed", label: "完了" },
  { value: "canceled", label: "キャンセル" },
] as const;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser("/mypage/sales");
  const { tab } = await searchParams;
  const activeTab = TABS.some((item) => item.value === tab) ? tab! : "active";

  const all = await getTransactionsFor(user.id, "seller");
  const counts = {
    active: all.filter((tx) => isActiveTransaction(tx.status)).length,
    completed: all.filter((tx) => tx.status === "completed").length,
    canceled: all.filter((tx) => tx.status === "canceled").length,
  };

  const visible = all.filter((tx) => {
    if (activeTab === "active") return isActiveTransaction(tx.status);
    if (activeTab === "completed") return tx.status === "completed";
    return tx.status === "canceled";
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link
        href="/mypage/listings"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        出品した商品
      </Link>

      <h1 className="text-xl font-bold">出品した商品の取引</h1>

      <nav className="mt-5">
        <ul className="flex gap-2">
          {TABS.map((item) => {
            const active = item.value === activeTab;
            return (
              <li key={item.value}>
                <Link
                  href={`/mypage/sales?tab=${item.value}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                  <span className="tabular-nums opacity-80">{counts[item.value]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Receipt className="size-10 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm text-muted-foreground">該当する取引はありません。</p>
          {activeTab === "active" && (
            <Button asChild className="mt-6 h-11">
              <Link href="/sell">出品する</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-5">
          <TransactionList transactions={visible} />
        </div>
      )}
    </div>
  );
}
