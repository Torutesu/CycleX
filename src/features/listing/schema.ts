import { z } from "zod";
import {
  CATEGORIES,
  COMPONENTS,
  CONDITIONS,
  DELIVERY_METHODS,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  FRAME_SIZES,
  MAX_IMAGES,
  MILEAGES,
  MODEL_YEAR_MIN,
  PARTS_SUBCATEGORIES,
  PREFECTURES,
  PRICE_MAX,
  PRICE_MIN,
  TITLE_MAX,
  TITLE_MIN,
  modelYearMax,
  optionValues,
} from "@/lib/constants";

const categoryValues = optionValues(CATEGORIES);
const subcategoryValues = optionValues(PARTS_SUBCATEGORIES);
const conditionValues = optionValues(CONDITIONS);
const mileageValues = optionValues(MILEAGES);
const frameSizeValues = optionValues(FRAME_SIZES);
const componentValues = optionValues(COMPONENTS);
const deliveryValues = optionValues(DELIVERY_METHODS);
const prefectureValues = optionValues(PREFECTURES);

/** 空文字を null に変換したうえで、許可された値かを検証する */
function optionalEnum(values: readonly string[]) {
  return z
    .string()
    .optional()
    .nullable()
    .transform((value) => (value && values.includes(value) ? value : null));
}

function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label}は${max}文字以内で入力してください`)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));
}

/** フォームから受け取る生の値(下書き・公開で共通) */
export const listingFormSchema = z.object({
  id: z.uuid().optional().nullable(),
  category: z.string().optional().nullable(),
  partsSubcategory: optionalEnum(subcategoryValues),
  title: z.string().trim().max(TITLE_MAX, `タイトルは${TITLE_MAX}文字以内で入力してください`),
  brandId: z.uuid().optional().nullable(),
  brandOther: optionalText(80, "ブランド名"),
  modelName: optionalText(80, "モデル名"),
  modelYear: z
    .union([z.coerce.number().int(), z.literal("")], { error: "年式は数値で入力してください" })
    .optional()
    .nullable()
    .transform((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
    .refine(
      (value) => value === null || (value >= MODEL_YEAR_MIN && value <= modelYearMax()),
      `年式は${MODEL_YEAR_MIN}年〜${modelYearMax()}年の範囲で入力してください`,
    ),
  frameSize: optionalEnum(frameSizeValues),
  frameSizeCm: z
    .union([z.coerce.number(), z.literal("")], {
      error: "フレームサイズ(cm)は数値で入力してください",
    })
    .optional()
    .nullable()
    .transform((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
    .refine(
      (value) => value === null || (value > 0 && value <= 999),
      "フレームサイズ(cm)は0より大きい数値で入力してください",
    ),
  component: optionalEnum(componentValues),
  componentNote: optionalText(200, "コンポーネントの補足"),
  mileage: optionalEnum(mileageValues),
  condition: optionalEnum(conditionValues),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, `商品説明は${DESCRIPTION_MAX}文字以内で入力してください`)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  price: z
    .union([z.coerce.number().int(), z.literal("")], {
      error: "希望価格は整数で入力してください",
    })
    .optional()
    .nullable()
    .transform((value) => (typeof value === "number" && Number.isFinite(value) ? value : null)),
  deliveryMethod: optionalEnum(deliveryValues),
  shippingFromPref: optionalEnum(prefectureValues),
  meetupPref: optionalEnum(prefectureValues),
  imagePaths: z
    .array(z.string().min(1))
    .max(MAX_IMAGES, `画像は${MAX_IMAGES}枚までです`)
    .default([]),
  /**
   * フォーム上で削除された画像のパス。保存が成功したあとに Storage から消す。
   * 所有者の検証は actions.ts 側で行う。
   */
  discardedImagePaths: z
    .array(z.string().min(1))
    .max(MAX_IMAGES * 4)
    .default([]),
});

export type ListingFormValues = z.infer<typeof listingFormSchema>;

/**
 * 下書き保存: タイトルのみ必須。
 * 未確定の状態で保存できることが目的なので、他項目は型チェックに留める。
 */
export const draftSchema = listingFormSchema.superRefine((values, ctx) => {
  if (values.title.length < 1) {
    ctx.addIssue({ code: "custom", path: ["title"], message: "タイトルを入力してください" });
  }
});

/**
 * 公開: FR-03-1 の必須項目をすべて検証する。
 * カテゴリ・受渡方法による条件付き必須もここで表現する。
 */
export const publishSchema = listingFormSchema.superRefine((values, ctx) => {
  const add = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });

  if (values.title.length < TITLE_MIN) {
    add("title", `タイトルは${TITLE_MIN}文字以上で入力してください`);
  }

  if (!values.category || !(categoryValues as readonly string[]).includes(values.category)) {
    add("category", "カテゴリを選択してください");
  }

  // パーツはサブカテゴリ必須、車体項目は保持しない
  if (values.category === "parts") {
    if (!values.partsSubcategory) {
      add("partsSubcategory", "パーツの種類を選択してください");
    }
  }

  if (!values.brandId && !values.brandOther) {
    add("brandId", "ブランドを選択、または「その他」でブランド名を入力してください");
  }

  if (!values.condition) {
    add("condition", "コンディションを選択してください");
  }

  if (!values.description) {
    add("description", "商品説明を入力してください");
  } else if (values.description.length < DESCRIPTION_MIN) {
    add("description", `商品説明は${DESCRIPTION_MIN}文字以上で入力してください`);
  }

  if (values.price === null) {
    add("price", "希望価格を入力してください");
  } else if (values.price < PRICE_MIN || values.price > PRICE_MAX) {
    add(
      "price",
      `希望価格は${PRICE_MIN.toLocaleString()}円〜${PRICE_MAX.toLocaleString()}円で入力してください`,
    );
  }

  if (!values.deliveryMethod) {
    add("deliveryMethod", "受渡方法を選択してください");
  }

  if (!values.shippingFromPref) {
    add("shippingFromPref", "発送元の地域を選択してください");
  }

  // 対面受渡は受渡地域が必須(FR-03-1)
  if (values.deliveryMethod === "in_person" && !values.meetupPref) {
    add("meetupPref", "対面での受渡地域を選択してください");
  }

  if (values.imagePaths.length < 1) {
    add("imagePaths", "商品画像を1枚以上アップロードしてください");
  }
});

/**
 * DB へ保存する形に整える。
 * パーツカテゴリでは車体固有の項目を落とす(FR-03-1)。
 */
export function toListingRow(values: ListingFormValues) {
  const isParts = values.category === "parts";

  return {
    category: values.category ?? "other",
    parts_subcategory: isParts ? values.partsSubcategory : null,
    title: values.title,
    brand_id: values.brandId ?? null,
    // マスタから選んだときは自由入力を捨てる(両方残ると検索で別ブランド名にヒットする)
    brand_other: values.brandId ? null : values.brandOther,
    model_name: values.modelName,
    model_year: values.modelYear,
    frame_size: isParts ? null : values.frameSize,
    frame_size_cm: isParts ? null : values.frameSizeCm,
    component: values.component,
    component_note: values.componentNote,
    mileage: isParts ? null : values.mileage,
    condition: values.condition,
    description: values.description,
    price: values.price,
    delivery_method: values.deliveryMethod,
    shipping_from_pref: values.shippingFromPref,
    meetup_pref: values.deliveryMethod === "in_person" ? values.meetupPref : null,
  };
}
