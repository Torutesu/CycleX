import type { Metadata } from "next";
import Link from "next/link";
import { Flag, Mail, ShieldAlert } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = { title: "お問い合わせ" };

/**
 * 問い合わせ窓口(利用規約 第21条2「本サービス上に表示する問い合わせ窓口」)。
 *
 * 取引の問題と通報はサイト内から送れる。取引画面から申告すると、
 * どの取引の話かが運営に伝わり、メッセージもそのまま確認できるため、そちらへ案内する。
 * メールの窓口は甲から届くまで「準備中」と出す(SUPPORT_EMAIL)。
 */
export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-bold">お問い合わせ</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        内容に合わせて、下の窓口からご連絡ください。
      </p>

      <div className="mt-6 space-y-4">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ShieldAlert className="size-4 text-primary" aria-hidden />
            取引で問題があったとき
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {
              "商品が届かない、説明と違う、破損・欠品がある、取引相手と連絡が取れないなどの場合は、その取引の取引画面にある「取引の問題を運営に申告する」から申告してください。運営が取引の内容とメッセージを確認します。"
            }
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 text-sm">
            <Link
              href="/mypage/purchases"
              className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
            >
              購入した取引
            </Link>
            <Link
              href="/mypage/sales"
              className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
            >
              販売した取引
            </Link>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Flag className="size-4 text-primary" aria-hidden />
            問題のある商品・利用者を見つけたとき
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {
              "盗品・偽造品の疑いや規約違反の出品などは、商品ページまたは利用者のプロフィールにある「通報する」からお知らせください。通報したことが相手に伝わることはありません。"
            }
          </p>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Mail className="size-4 text-primary" aria-hidden />
            その他のお問い合わせ
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            アカウントについてのご相談、個人情報の開示・訂正・削除等のご請求など、上記以外のお問い合わせはこちらへご連絡ください。
          </p>
          <p className="mt-3 text-sm">
            {SUPPORT_EMAIL ? (
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-medium text-primary break-all hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
            ) : (
              <span className="text-muted-foreground">
                メールでの窓口は準備中です。決まりしだい、このページに掲載します。
              </span>
            )}
          </p>
        </section>
      </div>
    </div>
  );
}
