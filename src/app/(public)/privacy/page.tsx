import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "プライバシーポリシー" };

export default function PrivacyPage() {
  return (
    <LegalPage title="プライバシーポリシー">
      {/* 文面は甲より支給される。ここに差し込むこと(別紙1 3.(5) により作成は対象外)。 */}
      <p>プライバシーポリシーは現在準備中です。</p>
    </LegalPage>
  );
}
