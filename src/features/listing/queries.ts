import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ListingStatus } from "@/lib/constants";

export type ListingDetail = {
  id: string;
  sellerId: string;
  /** 運営が非公開にした理由。出品者にだけ見せる */
  suspendedReason: string | null;
  status: ListingStatus;
  category: string;
  partsSubcategory: string | null;
  title: string;
  brandName: string | null;
  modelName: string | null;
  modelYear: number | null;
  frameSize: string | null;
  frameSizeCm: number | null;
  component: string | null;
  componentNote: string | null;
  mileage: string | null;
  condition: string | null;
  description: string | null;
  price: number | null;
  deliveryMethod: string | null;
  shippingFromPref: string | null;
  meetupPref: string | null;
  favoritesCount: number;
  publishedAt: string | null;
  updatedAt: string;
  imagePaths: string[];
  seller: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    prefecture: string | null;
    status: string;
    createdAt: string;
  } | null;
};

/**
 * FR-05: 商品詳細。RLS により非公開商品は本人・管理者のみ取得できる。
 *
 * generateMetadata と本体の両方から呼ばれるため memo 化する
 * (同じリクエスト内で同じ商品を2回引かない)。
 */
export const getListingDetail = cache(async function getListingDetail(
  id: string,
): Promise<ListingDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select(
      `id, seller_id, status, suspended_reason, category, parts_subcategory, title, model_name, model_year,
       frame_size, frame_size_cm, component, component_note, mileage, condition, description,
       price, delivery_method, shipping_from_pref, meetup_pref, favorites_count, published_at,
       updated_at, brand_other,
       brands(name),
       listing_images(path, position),
       seller:users!listings_seller_id_fkey(id, display_name, avatar_url, prefecture, status, created_at)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const imagePaths = [...(data.listing_images ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((image) => image.path);

  return {
    id: data.id,
    sellerId: data.seller_id,
    status: data.status as ListingStatus,
    suspendedReason: data.suspended_reason,
    category: data.category,
    partsSubcategory: data.parts_subcategory,
    title: data.title,
    brandName: data.brands?.name ?? data.brand_other,
    modelName: data.model_name,
    modelYear: data.model_year,
    frameSize: data.frame_size,
    frameSizeCm: data.frame_size_cm,
    component: data.component,
    componentNote: data.component_note,
    mileage: data.mileage,
    condition: data.condition,
    description: data.description,
    price: data.price,
    deliveryMethod: data.delivery_method,
    shippingFromPref: data.shipping_from_pref,
    meetupPref: data.meetup_pref,
    favoritesCount: data.favorites_count,
    publishedAt: data.published_at,
    updatedAt: data.updated_at,
    imagePaths,
    seller: data.seller
      ? {
          id: data.seller.id,
          displayName: data.seller.display_name,
          avatarUrl: data.seller.avatar_url,
          prefecture: data.seller.prefecture,
          createdAt: data.seller.created_at,
          status: data.seller.status,
        }
      : null,
  };
})
