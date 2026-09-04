import Link from "next/link";
import { ChevronLeft, Receipt, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { getTransactionsFor } from "@/features/transaction/queries";
import { TransactionList } from "@/features/transaction/components/transaction-list";
import { isActiveTransaction } from "@/features/transaction/state";
import { cn } from "@/lib/utils";

const TABS = [
  { value: "active", label: "進行中" },
  { value: "completed", label: "完了" },
  { value: "canceled", label: "キャンセル" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

/** 購入側・出品側で違うのは文言と導線だけなので、そこだけ差し替える */
const VIEWS = {
  buyer: {
    basePath: "/mypage/purchases",
    heading: "購入した取引",
    backHref: "/mypage",
    backLabel: "マイページ",
    icon: ShoppingBag,
    emptyDescription: "商品を購入すると、発送や受取のやり取りをここから進められます。",
    emptyAction: { href: "/search", label: "商品をさがす" },
  },
  seller: {
    basePath: "/mypage/sales",
    heading: "出品した商品の取引",
    backHref: "/mypage/listings",
    backLabel: "出品した商品",
    icon: Receipt,
    emptyDescription: "出品した商品が売れると、発送のご連絡をここから行います。",
    emptyAction: { href: "/sell", label: "出品する" },
  },
} as const;

const EMPTY_TITLES: Record<TabValue, string> = {
  active: "進行中の取引はありません",
  completed: "完了した取引はありません",
  canceled: "キャンセルされた取引はありません",
};

/** M-11: 取引履歴(進行中 / 完了 / キャンセル)。購入側と出品側で共通 */
export async function TransactionTabsPage({
  userId,
  role,
  tab,
}: {
  userId: string;
  role: "buyer" | "seller";
  tab?: string;
}) {
  const view = VIEWS[role];
  const activeTab: TabValue = TABS.some((item) => item.value === tab)
    ? (tab as TabValue)
    : "active";

  const all = await getTransactionsFor(userId, role);
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

  const EmptyIcon = view.icon;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link
        href={view.backHref}
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {view.backLabel}
      </Link>

      <h1 className="text-xl font-bold">{view.heading}</h1>

      <nav className="mt-5">
        <ul className="flex gap-2">
          {TABS.map((item) => {
            const active = item.value === activeTab;
            return (
              <li key={item.value}>
                <Link
                  href={`${view.basePath}?tab=${item.value}`}
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
        <EmptyState
          icon={EmptyIcon}
          title={EMPTY_TITLES[activeTab]}
          description={activeTab === "active" ? view.emptyDescription : undefined}
          action={
            activeTab === "active" && (
              <Button asChild className="h-11">
                <Link href={view.emptyAction.href}>{view.emptyAction.label}</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="mt-5">
          <TransactionList transactions={visible} />
        </div>
      )}
    </div>
  );
}
