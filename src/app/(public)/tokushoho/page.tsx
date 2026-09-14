import type { ReactNode } from "react";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "特定商取引法に基づく表記" };

/**
 * 表記の内容は甲より支給されたもの(2026-09-14 受領)。
 * 文面の作成は業務対象外(別紙1 3.(5))のため、値をそのまま掲載する。
 *
 * 販売事業者名と問い合わせ先アドレスはサイト名の確定後に決まるため、
 * 未確定のあいだは null にしておく。null の項目は「準備中」と表示し、
 * ページ上部にも未確定である旨を出す(確定済みと誤認されないようにする)。
 */
const SELLER_NAME: string | null = null;
/** サイト名の確定後に `support@<ドメイン>` を入れる */
const CONTACT_EMAIL: string | null = null;

type Row = { term: string; description: ReactNode };

const ROWS: Row[] = [
  { term: "販売事業者", description: SELLER_NAME },
  { term: "代表者", description: "鈴木 財恩" },
  { term: "所在地", description: "〒253-0021 神奈川県茅ヶ崎市浜竹4-3-5-201" },
  {
    term: "電話番号",
    description: (
      <a href="tel:08025758884" className="underline underline-offset-2">
        080-2575-8884
      </a>
    ),
  },
  {
    term: "メールアドレス",
    description: CONTACT_EMAIL ? (
      <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">
        {CONTACT_EMAIL}
      </a>
    ) : null,
  },
  { term: "販売価格", description: "各商品ページに表示" },
  { term: "販売数量", description: "各商品ページに表示" },
  { term: "支払方法", description: "クレジットカード" },
  { term: "支払時期", description: "購入手続き完了時" },
  { term: "商品の引渡し時期", description: "出品者と購入者の合意による" },
  {
    term: "返品・キャンセル",
    description: (
      <>
        お客さま都合による返品・交換は受け付けておりません。
        <br />
        到着した商品に不良・不足があった場合は、商品名や状況を明記のうえ、お問い合わせからご連絡ください。
      </>
    ),
  },
  {
    term: "その他",
    description: "中古品のため、商品の状態は各商品ページをご確認ください。",
  },
];

const hasPendingRows = ROWS.some((row) => row.description === null);

export default function TokushohoPage() {
  return (
    <LegalPage title="特定商取引法に基づく表記">
      {hasPendingRows && (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
          一部の項目は準備中です。確定しだい掲載します。
        </p>
      )}

      <dl className="divide-y divide-border border-y border-border">
        {ROWS.map((row) => (
          <div key={row.term} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="font-medium text-foreground">{row.term}</dt>
            <dd>{row.description ?? <span className="italic">準備中</span>}</dd>
          </div>
        ))}
      </dl>
    </LegalPage>
  );
}
