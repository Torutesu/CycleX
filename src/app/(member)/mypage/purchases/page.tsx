import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { TransactionTabsPage } from "@/features/transaction/components/transaction-tabs";

export const metadata: Metadata = { title: "購入した取引" };

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser("/mypage/purchases");
  const { tab } = await searchParams;

  return <TransactionTabsPage userId={user.id} role="buyer" tab={tab} />;
}
