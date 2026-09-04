import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { TransactionTabsPage } from "@/features/transaction/components/transaction-tabs";

export const metadata: Metadata = { title: "出品した商品の取引" };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser("/mypage/sales");
  const { tab } = await searchParams;

  return <TransactionTabsPage userId={user.id} role="seller" tab={tab} />;
}
