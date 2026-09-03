import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/session";
import { getListingDetail } from "@/features/listing/queries";
import { PurchaseButton } from "@/features/transaction/components/purchase-button";
import { canPurchase } from "@/features/listing/rules";
import { listingImageUrl } from "@/lib/images";
import { formatPrice } from "@/lib/utils";
import { DELIVERY_METHODS, PREFECTURES, labelOf } from "@/lib/constants";
import { isDemoCheckout } from "@/lib/demo";

export const metadata: Metadata = { title: "購入手続き" };

export default async function PurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/items/${id}/purchase`);
  const listing = await getListingDetail(id);

  if (!listing) notFound();

  const isOwner = listing.sellerId === user.id;
  // 自分の出品では支払えない。無効なボタンだけの画面を見せても行き止まりなので戻す
  if (isOwner) redirect(`/items/${listing.id}`);

  const purchasable = canPurchase(listing.status);
  const demo = isDemoCheckout();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href={`/items/${id}`}
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        商品ページへ戻る
      </Link>

      <h1 className="text-xl font-bold">購入手続き</h1>

      {!user.emailVerified && (
        <Alert className="mt-5">
          <AlertDescription>
            購入にはメールアドレスの確認が必要です。
            <Link
              href={`/verify-email?email=${encodeURIComponent(user.email)}`}
              className="ml-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              確認メールを再送する
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {!purchasable && (
        <Alert variant="destructive" className="mt-5">
          <AlertDescription>
            {isOwner
              ? "自分が出品した商品は購入できません。"
              : "この商品は現在購入できません。すでに取引中か、販売が終了している可能性があります。"}
          </AlertDescription>
        </Alert>
      )}

      {/* 商品の確認 */}
      <section className="mt-6 rounded-xl border bg-card p-4">
        <div className="flex gap-3">
          {listing.imagePaths[0] && (
            <Image
              src={listingImageUrl(listing.imagePaths[0])}
              alt=""
              width={80}
              height={80}
              className="size-20 shrink-0 rounded-md object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 break-phrase text-sm font-medium">{listing.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              出品者: {listing.seller?.displayName ?? "—"}
            </p>
          </div>
        </div>

        <Separator className="my-4" />

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">受渡方法</dt>
            <dd>{labelOf(DELIVERY_METHODS, listing.deliveryMethod) ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              {listing.deliveryMethod === "in_person" ? "受渡地域" : "発送元"}
            </dt>
            <dd>{labelOf(PREFECTURES, listing.meetupPref ?? listing.shippingFromPref) ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">商品代金</dt>
            <dd className="tabular-nums">{formatPrice(listing.price)}</dd>
          </div>
        </dl>

        <Separator className="my-4" />

        <div className="flex items-baseline justify-between">
          <span className="font-medium">お支払い金額</span>
          <span className="text-xl font-bold tabular-nums">{formatPrice(listing.price)}</span>
        </div>
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {listing.deliveryMethod === "shipping" ? "送料込み・税込" : "税込"}
        </p>
      </section>

      <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-muted/50 p-3.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        {demo ? (
          <p>
            この環境はデモ用です。実際の支払いは発生せず、
            次の画面で支払い済みの状態を再現します。以降の発送・受取・評価は本番と同じ流れで動きます。
          </p>
        ) : (
          <p>
            お支払いは決済代行サービス(Stripe)の決済ページで行います。カード情報が CycleX
            に保存されることはありません。決済後は取引画面から発送・受取のご連絡ができます。
          </p>
        )}
      </div>

      <div className="mt-6">
        <PurchaseButton
          listingId={listing.id}
          disabled={!purchasable || !user.emailVerified}
          price={listing.price}
        />
      </div>
    </div>
  );
}
