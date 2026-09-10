import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireUser } from "@/lib/session";
import { listActiveBrands } from "@/features/listing/actions";
import { ListingForm } from "@/features/listing/components/listing-form";
import { emptyListingDefaults } from "@/features/listing/defaults";
import { getPlatformFeeRate } from "@/features/listing/fee";

export const metadata: Metadata = { title: "出品する" };

export default async function SellPage() {
  const user = await requireUser("/sell");
  const brands = await listActiveBrands();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-bold">出品する</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        自転車本体・パーツを出品できます。下書き保存もできます。
      </p>

      {!user.emailVerified ? (
        <Alert className="mt-6">
          <AlertDescription>
            出品にはメールアドレスの確認が必要です。
            <Link
              href={`/verify-email?email=${encodeURIComponent(user.email)}`}
              className="ml-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              確認メールを再送する
            </Link>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="mt-6">
          <ListingForm
            userId={user.id}
            brands={brands}
            feeRate={getPlatformFeeRate()}
            defaults={emptyListingDefaults(user.prefecture)}
            allowDraft
          />
        </div>
      )}
    </div>
  );
}
