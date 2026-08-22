import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "特定商取引法に基づく表記" };

export default function TokushohoPage() {
  return (
    <LegalPage title="特定商取引法に基づく表記">
      {/* 文面は甲より支給される。ここに差し込むこと(別紙1 3.(5) により作成は対象外)。 */}
      <p>特定商取引法に基づく表記は現在準備中です。</p>
    </LegalPage>
  );
}
