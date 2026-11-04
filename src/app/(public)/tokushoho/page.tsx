import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { LegalPage } from "@/components/legal-page";
import { REPORT_DEADLINE_DAYS, SITE_NAME, SUPPORT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = { title: "特定商取引法に基づく表記" };

const linkClass = "text-primary underline underline-offset-2";

/**
 * 特定商取引法に基づく表記。
 * 運営者の情報はプライバシーポリシー第13条、条件は利用規約・取引ルール(いずれも甲の指定)による。
 */
const entries: [string, ReactNode][] = [
  ["サービス名", SITE_NAME],
  ["運営者", "鈴木財恩"],
  ["運営責任者", "鈴木財恩"],
  ["所在地", "神奈川県茅ヶ崎市浜竹4-3-5-201"],
  ["電話番号", "請求があった場合には、遅滞なく開示いたします。"],
  [
    "お問い合わせ",
    <>
      {SUPPORT_EMAIL}
      <br />
      <Link href="/contact" className={linkClass}>
        お問い合わせの窓口
      </Link>
    </>,
  ],
  [
    "販売価格",
    `各商品ページに表示する価格(税込)です。商品は各出品者が販売するもので、${SITE_NAME}は売買の場を提供しています。`,
  ],
  [
    "商品代金以外の必要料金",
    "配送(着払い)の商品は、受け取りの際に配送業者へ送料をお支払いください。サイトの利用料・決済手数料を購入者にご負担いただくことはありません。インターネットの接続・通信にかかる料金はお客様のご負担です。",
  ],
  [
    "販売手数料(出品者)",
    "商品が売れた場合、商品代金の7%。キャンセルが成立した取引ではかかりません。",
  ],
  ["支払方法", "クレジットカード(決済代行サービス Stripe による決済)"],
  [
    "支払時期",
    "購入手続きの際にお支払いいただきます。お支払いが完了した時点で売買契約が成立します。",
  ],
  [
    "商品の引渡時期",
    "お支払いの完了後、出品者が配送または直接手渡しで引き渡します。発送・受け渡しの日時は、取引画面のメッセージで出品者と購入者が調整します。",
  ],
  [
    "返品・キャンセル",
    <>
      商品説明や掲載画像との相違、未着、出品者側の事情で発送・引き渡しができない場合に受け付けます。購入者の都合による返品・キャンセルは、発送前で双方が合意している場合を除き、お受けできません。申告は商品の受け取りから
      {REPORT_DEADLINE_DAYS}日以内に、取引画面から行ってください。詳しくは
      <Link href="/rules" className={linkClass}>
        取引ルール
      </Link>
      をご確認ください。
    </>,
  ],
];

export default function TokushohoPage() {
  return (
    <LegalPage title="特定商取引法に基づく表記">
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
