import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記（ダミー）",
  robots: { index: false, follow: false },
};

const entries = [
  ["サービス名", "BicycleMarket"],
  ["運営事業者", "BicycleMarket運営事業者（ダミー・正式名称未確定）"],
  ["運営責任者", "【正式な責任者名に差し替え】"],
  ["所在地", "【正式な所在地・郵便番号に差し替え】"],
  ["電話番号", "【正式な問い合わせ用電話番号に差し替え】"],
  ["メールアドレス", "support@example.com（ダミー・送信不可）"],
  ["受付時間", "【営業日・受付時間に差し替え】"],
  [
    "販売価格",
    "各商品ページに表示する価格を想定しています。出品者による販売と運営サービスの提供の位置づけは正式版で明示します。",
  ],
  ["商品代金以外の費用", "【販売手数料、送料、その他の費用と負担者を確定して記載】"],
  [
    "支払方法・支払時期",
    "Stripeによるカード決済を想定しています。利用可能な決済方法、支払時期、支払期限は正式版で確定します。",
  ],
  ["商品の引渡時期", "【配送の発送期限、到着目安、手渡しの日程の決め方を確定して記載】"],
  [
    "キャンセル・返品・返金",
    "【受付条件、申出期限、手続き、返送料負担を確定して記載】商品の不具合や説明との相違がある場合の対応も正式版で定めます。",
  ],
  ["販売数量・申込期限", "【数量制限や申込期限がある場合の条件を記載】"],
];

export default function TokushohoPage() {
  return (
    <LegalPage title="特定商取引法に基づく表記">
      <p>
        以下は掲載項目と表示を確認するためのサンプルです。実在の事業者情報や正式な販売条件ではありません。運営事業者と各出品者の立場に応じた表記を確認し、正式公開前に差し替えます。
      </p>
      <dl className="divide-y rounded-lg border px-4">
        {entries.map(([label, value]) => (
          <div key={label} className="grid gap-2 py-4 sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold text-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </LegalPage>
  );
}
