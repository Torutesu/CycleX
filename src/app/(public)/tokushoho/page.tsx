import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { companyFields } from "@/lib/company";

export const metadata: Metadata = { title: "特定商取引法に基づく表記" };

export default function TokushohoPage() {
  // 値は src/lib/company.ts に入れる(別紙1 3.(5) により文面の作成は対象外)。
  // 空のままの項目は出さない。埋まっていない情報をそれらしく見せないため。
  const fields = companyFields();

  return (
    <LegalPage title="特定商取引法に基づく表記">
      {fields.length === 0 ? (
        <p>特定商取引法に基づく表記は現在準備中です。</p>
      ) : (
        <dl className="divide-y rounded-xl border">
          {fields.map((field) => (
            <div
              key={field.label}
              className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4"
            >
              <dt className="text-sm font-medium text-foreground">{field.label}</dt>
              <dd className="text-sm whitespace-pre-line">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </LegalPage>
  );
}
