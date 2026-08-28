/**
 * ドメイン定数の一元管理。
 * DB の CHECK 制約 / Zod スキーマ / UI 表示ラベルはすべてここを参照する。
 */

export type Option<T extends string = string> = { value: T; label: string };

/** Option 配列から value のユニオン型 tuple を取り出す(Zod enum 用) */
export function optionValues<T extends string>(options: readonly Option<T>[]): [T, ...T[]] {
  return options.map((o) => o.value) as [T, ...T[]];
}

/** Option 配列から value → label の解決 */
export function labelOf<T extends string>(
  options: readonly Option<T>[],
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? null;
}

// ============================================================
// カテゴリ
// ============================================================

export const CATEGORIES = [
  { value: "road", label: "ロードバイク" },
  { value: "cross", label: "クロスバイク" },
  { value: "mtb", label: "マウンテンバイク" },
  { value: "city", label: "シティサイクル" },
  { value: "minivelo", label: "ミニベロ" },
  { value: "ebike", label: "e-bike" },
  { value: "parts", label: "パーツ" },
  { value: "other", label: "その他" },
] as const satisfies readonly Option[];

export type Category = (typeof CATEGORIES)[number]["value"];

/** パーツ以外(=車体)のカテゴリ。フレームサイズ等の車体項目を表示する対象 */
export const BIKE_CATEGORIES: readonly Category[] = [
  "road",
  "cross",
  "mtb",
  "city",
  "minivelo",
  "ebike",
];

export function isBikeCategory(category: string | null | undefined): boolean {
  return !!category && (BIKE_CATEGORIES as readonly string[]).includes(category);
}

export const PARTS_SUBCATEGORIES = [
  { value: "frame", label: "フレーム" },
  { value: "wheel", label: "ホイール" },
  { value: "component", label: "コンポーネント" },
  { value: "cockpit", label: "ハンドル・ステム・シートポスト" },
  { value: "saddle", label: "サドル" },
  { value: "pedal", label: "ペダル" },
  { value: "tire", label: "タイヤ・チューブ" },
  { value: "accessory", label: "アクセサリ" },
  { value: "other", label: "その他" },
] as const satisfies readonly Option[];

export type PartsSubcategory = (typeof PARTS_SUBCATEGORIES)[number]["value"];

// ============================================================
// スペック
// ============================================================

export const CONDITIONS = [
  { value: "new", label: "新品・未使用" },
  { value: "like_new", label: "未使用に近い" },
  { value: "good", label: "目立った傷や汚れなし" },
  { value: "fair", label: "やや傷や汚れあり" },
  { value: "poor", label: "傷や汚れあり" },
  { value: "junk", label: "全体的に状態が悪い(ジャンク)" },
] as const satisfies readonly Option[];

export type Condition = (typeof CONDITIONS)[number]["value"];

export const MILEAGES = [
  { value: "lte100", label: "〜100km" },
  { value: "lte500", label: "〜500km" },
  { value: "lte1000", label: "〜1,000km" },
  { value: "lte3000", label: "〜3,000km" },
  { value: "lte5000", label: "〜5,000km" },
  { value: "gt5000", label: "5,000km以上" },
  { value: "unknown", label: "不明" },
] as const satisfies readonly Option[];

export type Mileage = (typeof MILEAGES)[number]["value"];

export const FRAME_SIZES = [
  { value: "XS", label: "XS" },
  { value: "S", label: "S" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
  { value: "XL", label: "XL" },
  { value: "other", label: "その他・不明" },
] as const satisfies readonly Option[];

export type FrameSize = (typeof FRAME_SIZES)[number]["value"];

export const COMPONENTS = [
  { value: "shimano_claris", label: "Shimano Claris" },
  { value: "shimano_sora", label: "Shimano Sora" },
  { value: "shimano_tiagra", label: "Shimano Tiagra" },
  { value: "shimano_105", label: "Shimano 105" },
  { value: "shimano_ultegra", label: "Shimano Ultegra" },
  { value: "shimano_dura_ace", label: "Shimano Dura-Ace" },
  { value: "shimano_deore", label: "Shimano Deore" },
  { value: "shimano_slx", label: "Shimano SLX" },
  { value: "shimano_xt", label: "Shimano XT" },
  { value: "shimano_xtr", label: "Shimano XTR" },
  { value: "sram_apex", label: "SRAM Apex" },
  { value: "sram_rival", label: "SRAM Rival" },
  { value: "sram_force", label: "SRAM Force" },
  { value: "sram_red", label: "SRAM Red" },
  { value: "sram_nx", label: "SRAM NX" },
  { value: "sram_gx", label: "SRAM GX" },
  { value: "sram_x01", label: "SRAM X01" },
  { value: "sram_xx1", label: "SRAM XX1" },
  { value: "campagnolo_centaur", label: "Campagnolo Centaur" },
  { value: "campagnolo_chorus", label: "Campagnolo Chorus" },
  { value: "campagnolo_record", label: "Campagnolo Record" },
  { value: "campagnolo_super_record", label: "Campagnolo Super Record" },
  { value: "other", label: "その他" },
  { value: "unknown", label: "不明" },
] as const satisfies readonly Option[];

export type ComponentGrade = (typeof COMPONENTS)[number]["value"];

// ============================================================
// 受渡・地域
// ============================================================

export const DELIVERY_METHODS = [
  { value: "shipping", label: "配送(送料込み)" },
  { value: "in_person", label: "対面(手渡し)" },
] as const satisfies readonly Option[];

export type DeliveryMethod = (typeof DELIVERY_METHODS)[number]["value"];

/** JIS X 0401 都道府県コード */
export const PREFECTURES = [
  { value: "01", label: "北海道" },
  { value: "02", label: "青森県" },
  { value: "03", label: "岩手県" },
  { value: "04", label: "宮城県" },
  { value: "05", label: "秋田県" },
  { value: "06", label: "山形県" },
  { value: "07", label: "福島県" },
  { value: "08", label: "茨城県" },
  { value: "09", label: "栃木県" },
  { value: "10", label: "群馬県" },
  { value: "11", label: "埼玉県" },
  { value: "12", label: "千葉県" },
  { value: "13", label: "東京都" },
  { value: "14", label: "神奈川県" },
  { value: "15", label: "新潟県" },
  { value: "16", label: "富山県" },
  { value: "17", label: "石川県" },
  { value: "18", label: "福井県" },
  { value: "19", label: "山梨県" },
  { value: "20", label: "長野県" },
  { value: "21", label: "岐阜県" },
  { value: "22", label: "静岡県" },
  { value: "23", label: "愛知県" },
  { value: "24", label: "三重県" },
  { value: "25", label: "滋賀県" },
  { value: "26", label: "京都府" },
  { value: "27", label: "大阪府" },
  { value: "28", label: "兵庫県" },
  { value: "29", label: "奈良県" },
  { value: "30", label: "和歌山県" },
  { value: "31", label: "鳥取県" },
  { value: "32", label: "島根県" },
  { value: "33", label: "岡山県" },
  { value: "34", label: "広島県" },
  { value: "35", label: "山口県" },
  { value: "36", label: "徳島県" },
  { value: "37", label: "香川県" },
  { value: "38", label: "愛媛県" },
  { value: "39", label: "高知県" },
  { value: "40", label: "福岡県" },
  { value: "41", label: "佐賀県" },
  { value: "42", label: "長崎県" },
  { value: "43", label: "熊本県" },
  { value: "44", label: "大分県" },
  { value: "45", label: "宮崎県" },
  { value: "46", label: "鹿児島県" },
  { value: "47", label: "沖縄県" },
] as const satisfies readonly Option[];

export type Prefecture = (typeof PREFECTURES)[number]["value"];

// ============================================================
// ステータス
// ============================================================

export const LISTING_STATUSES = [
  { value: "draft", label: "下書き" },
  { value: "published", label: "公開中" },
  { value: "trading", label: "取引中" },
  { value: "sold", label: "売却済" },
  { value: "withdrawn", label: "取下げ" },
  { value: "suspended", label: "運営により非公開" },
] as const satisfies readonly Option[];

export type ListingStatus = (typeof LISTING_STATUSES)[number]["value"];

/** 一般ユーザーから閲覧可能な商品ステータス */
export const PUBLIC_LISTING_STATUSES: readonly ListingStatus[] = ["published", "trading", "sold"];

export const TRANSACTION_STATUSES = [
  { value: "pending_payment", label: "支払い待ち" },
  { value: "paid", label: "支払い済み" },
  { value: "shipped", label: "発送・受渡連絡済み" },
  { value: "received", label: "受取確認済み" },
  { value: "completed", label: "取引完了" },
  { value: "canceled", label: "キャンセル" },
] as const satisfies readonly Option[];

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]["value"];

/** 進行中(退会不可・排他対象)とみなす取引ステータス */
export const ACTIVE_TRANSACTION_STATUSES: readonly TransactionStatus[] = [
  "pending_payment",
  "paid",
  "shipped",
  "received",
];

export const USER_STATUSES = [
  { value: "active", label: "利用中" },
  { value: "suspended", label: "利用停止" },
  { value: "withdrawn", label: "退会済み" },
] as const satisfies readonly Option[];

export type UserStatus = (typeof USER_STATUSES)[number]["value"];

// ============================================================
// 通報
// ============================================================

export const REPORT_REASONS = [
  { value: "prohibited", label: "禁止出品物" },
  { value: "fraud", label: "詐欺の疑い" },
  { value: "inappropriate", label: "不適切な内容" },
  { value: "tos_violation", label: "規約違反" },
  { value: "other", label: "その他" },
] as const satisfies readonly Option[];

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const REPORT_STATUSES = [
  { value: "open", label: "未対応" },
  { value: "resolved", label: "対応済み" },
] as const satisfies readonly Option[];

// ============================================================
// 並び替え
// ============================================================

export const SORT_OPTIONS = [
  { value: "new", label: "新着順" },
  { value: "price_asc", label: "価格の安い順" },
  { value: "price_desc", label: "価格の高い順" },
  { value: "popular", label: "お気に入りの多い順" },
] as const satisfies readonly Option[];

export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

/** 価格帯のプリセット(検索フィルタ用) */
export const PRICE_PRESETS = [
  { label: "〜1万円", min: null, max: 10000 },
  { label: "1〜3万円", min: 10000, max: 30000 },
  { label: "3〜10万円", min: 30000, max: 100000 },
  { label: "10〜30万円", min: 100000, max: 300000 },
  { label: "30万円〜", min: 300000, max: null },
] as const;

// ============================================================
// 数値制約
// ============================================================

export const PRICE_MIN = 300;
export const PRICE_MAX = 9_999_999;
export const MAX_IMAGES = 10;
export const MAX_DRAFTS = 20;
export const PAGE_SIZE = 24;
export const ADMIN_PAGE_SIZE = 20;
export const MODEL_YEAR_MIN = 1980;

export const TITLE_MIN = 5;
export const TITLE_MAX = 80;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 2000;
export const BIO_MAX = 1000;
export const DISPLAY_NAME_MAX = 30;
export const MESSAGE_MAX = 1000;
export const REVIEW_COMMENT_MAX = 500;
export const SHIPPING_NOTE_MAX = 500;
export const REPORT_DETAIL_MAX = 1000;

/** 画像アップロード制約 */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const IMAGE_EXTENSIONS: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * 保存名に使う拡張子を MIME タイプから決める。
 * 利用者が付けたファイル名は信用せず、許可済みの形式だけを通す。
 */
export function extensionForImageType(type: string): string {
  return IMAGE_EXTENSIONS[type as AllowedImageType] ?? "jpg";
}

/** 評価が自動公開されるまでの日数(報復評価抑止) */
export const REVIEW_AUTO_PUBLISH_DAYS = 14;

/**
 * Stripe Checkout セッションの有効期限(分)。
 *
 * Stripe の `expires_at` は「現在より30分以上先」が要件。ちょうど30分で送ると
 * サーバ時刻がわずかに遅れているだけで Session の作成が失敗するため、余裕を持たせる。
 */
export const CHECKOUT_EXPIRES_MINUTES = 45;

/**
 * 未決済のまま放置された取引を掃除するまでの経過時間(分)。
 * Checkout の有効期限より必ず後にする(期限切れ Webhook を先に効かせるため)。
 */
export const STALE_PAYMENT_CLEANUP_MINUTES = 90;

export function modelYearMax(): number {
  return new Date().getFullYear() + 1;
}
