import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "利用規約" };

export default function TermsPage() {
  return (
    <LegalPage title="利用規約">
      {/* 文面は甲より支給される。ここに差し込むこと(別紙1 3.(5) により作成は対象外)。 */}
      <p>利用規約は現在準備中です。</p>
    </LegalPage>
  );
}
