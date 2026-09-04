import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { listActiveBrands } from "@/features/listing/actions";
import { ListingForm } from "@/features/listing/components/listing-form";
import { toFormDefaults } from "@/features/listing/defaults";
import { getPlatformFeeRate } from "@/features/listing/fee";
import { canEditListing } from "@/features/listing/rules";
import type { ListingStatus } from "@/lib/constants";

export const metadata: Metadata = { title: "出品を編集" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/sell/${id}/edit`);

  const supabase = await createClient();
  const { data: listing } = await supabase
    .from("listings")
    .select(
      `id, seller_id, status, category, parts_subcategory, title, brand_id, brand_other, model_name,
       model_year, frame_size, frame_size_cm, component, component_note, mileage, condition,
       description, price, delivery_method, shipping_from_pref, meetup_pref,
       listing_images(path, position)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!listing || listing.seller_id !== user.id) notFound();

  const status = listing.status as ListingStatus;
  if (!canEditListing(status)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <h1 className="text-lg font-bold">この商品は編集できません</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {status === "suspended"
            ? "運営により非公開となっています。"
            : "取引中または売却済みの商品は編集できません。"}
        </p>
        <Link
          href="/mypage/listings"
          className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          出品した商品へ戻る
        </Link>
      </div>
    );
  }

  const imagePaths = [...(listing.listing_images ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((image) => image.path);

  const brands = await listActiveBrands();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href="/mypage/listings"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        出品した商品
      </Link>

      <h1 className="text-xl font-bold">出品を編集</h1>

      <div className="mt-6">
        <ListingForm
          userId={user.id}
          brands={brands}
          feeRate={getPlatformFeeRate()}
          defaults={toFormDefaults(listing, imagePaths)}
          allowDraft={status === "draft"}
          currentStatus={status}
        />
      </div>
    </div>
  );
}
