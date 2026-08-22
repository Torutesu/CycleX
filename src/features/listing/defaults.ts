import type { ListingFormDefaults } from "@/features/listing/components/listing-form";

/** 新規出品フォームの初期値。発送元はプロフィールの所在地を引き継ぐ。 */
export function emptyListingDefaults(prefecture: string | null): ListingFormDefaults {
  return {
    category: "",
    partsSubcategory: "",
    title: "",
    brandId: "",
    brandOther: "",
    modelName: "",
    modelYear: "",
    frameSize: "",
    frameSizeCm: "",
    component: "",
    componentNote: "",
    mileage: "",
    condition: "",
    description: "",
    price: "",
    deliveryMethod: "",
    shippingFromPref: prefecture ?? "",
    meetupPref: "",
    imagePaths: [],
  };
}

type ListingRow = {
  id: string;
  category: string;
  parts_subcategory: string | null;
  title: string;
  brand_id: string | null;
  brand_other: string | null;
  model_name: string | null;
  model_year: number | null;
  frame_size: string | null;
  frame_size_cm: number | null;
  component: string | null;
  component_note: string | null;
  mileage: string | null;
  condition: string | null;
  description: string | null;
  price: number | null;
  delivery_method: string | null;
  shipping_from_pref: string | null;
  meetup_pref: string | null;
};

/** DB の行を編集フォームの初期値へ変換する */
export function toFormDefaults(row: ListingRow, imagePaths: string[]): ListingFormDefaults {
  return {
    id: row.id,
    category: row.category ?? "",
    partsSubcategory: row.parts_subcategory ?? "",
    title: row.title ?? "",
    // 自由入力のブランドはセレクトの「その他」を選択済みにする
    brandId: row.brand_id ?? (row.brand_other ? "__other__" : ""),
    brandOther: row.brand_other ?? "",
    modelName: row.model_name ?? "",
    modelYear: row.model_year ? String(row.model_year) : "",
    frameSize: row.frame_size ?? "",
    frameSizeCm: row.frame_size_cm !== null ? String(row.frame_size_cm) : "",
    component: row.component ?? "",
    componentNote: row.component_note ?? "",
    mileage: row.mileage ?? "",
    condition: row.condition ?? "",
    description: row.description ?? "",
    price: row.price !== null ? String(row.price) : "",
    deliveryMethod: row.delivery_method ?? "",
    shippingFromPref: row.shipping_from_pref ?? "",
    meetupPref: row.meetup_pref ?? "",
    imagePaths,
  };
}
