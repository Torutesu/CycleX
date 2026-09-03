/**
 * 開発・デモ用の出品データを生成する。
 *
 *   node scripts/seed-dev.mjs [件数]
 *
 * .env.local の Supabase 設定を使い、既存ユーザーの出品として作成する。
 * 車種はカタログ(seed-catalog.mjs)から取り、価格・状態・走行距離・
 * 説明文が互いに矛盾しないように組み立てる。本番の商用データではない。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { BIKES, PARTS, SIZE_CM, buildDescription } from "./seed-catalog.mjs";

const COUNT = Number(process.argv[2] ?? 500);

// .env.local を読む(dotenv を足さずに済ませる)
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const THIS_YEAR = 2026;

/** 状態の出やすさ。中古市場に合わせて「目立った傷なし」あたりを厚くする */
const CONDITION_WEIGHTS = [
  ["new", 6],
  ["like_new", 18],
  ["good", 38],
  ["fair", 24],
  ["poor", 9],
  ["junk", 5],
];

/** 状態ごとの値引き率 */
const CONDITION_FACTOR = {
  new: 1,
  like_new: 0.9,
  good: 0.75,
  fair: 0.6,
  poor: 0.4,
  junk: 0.2,
};

/** 状態と噛み合う走行距離。新品に「5,000km超」が付かないようにする */
const MILEAGE_BY_CONDITION = {
  new: [null],
  like_new: ["lte100", "lte500"],
  good: ["lte500", "lte1000", "lte3000"],
  fair: ["lte1000", "lte3000", "lte5000"],
  poor: ["lte5000", "gt5000", "unknown"],
  junk: ["gt5000", "unknown"],
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weighted(pairs) {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  let point = Math.random() * total;
  for (const [value, weight] of pairs) {
    point -= weight;
    if (point <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

/** 相場・状態・年式から値段を決め、切りの良い数字に丸める */
function priceOf([min, max], condition, year) {
  const base = randomInt(min, max);
  const age = Math.min(0.35, Math.max(0, THIS_YEAR - year) * 0.03);
  const value = base * CONDITION_FACTOR[condition] * (1 - age);
  const unit = value < 20000 ? 500 : 1000;
  return Math.max(unit, Math.round(value / unit) * unit);
}

const { data: users } = await supabase
  .from("users")
  .select("id, prefecture")
  .eq("status", "active")
  .eq("role", "user");
const { data: brands } = await supabase.from("brands").select("id, name").eq("is_active", true);

if (!users?.length || !brands?.length) {
  console.error("ユーザーまたはブランドが存在しません。先に会員登録してください。");
  process.exit(1);
}

const brandByName = new Map(brands.map((brand) => [brand.name, brand.id]));
const missing = [...new Set([...BIKES, ...PARTS].map((e) => e.brand))].filter(
  (name) => !brandByName.has(name),
);
if (missing.length > 0) {
  console.error("brands に無いブランドがあります:", missing.join(", "));
  process.exit(1);
}

const rows = [];
for (let i = 0; i < COUNT; i += 1) {
  // 実際の売り場に近い比率にする(パーツは2割ほど)
  const isParts = Math.random() < 0.2;
  const entry = isParts ? pick(PARTS) : pick(BIKES);
  const condition = weighted(CONDITION_WEIGHTS);
  const seller = pick(users);
  const pref = seller.prefecture ?? String(randomInt(1, 47)).padStart(2, "0");
  const delivery = Math.random() > 0.25 ? "shipping" : "in_person";
  const year = isParts
    ? null
    : randomInt(Math.max(2012, entry.since ?? 2012), condition === "new" ? THIS_YEAR : THIS_YEAR - 1);

  // サイズ表記のある車種だけフレームサイズを持つ(ミニベロ・シティ・e-bike は無し)
  const hasSize = !isParts && entry.sizes === undefined;
  const size = hasSize ? pick(Object.keys(SIZE_CM)) : null;

  const title = isParts
    ? `${entry.brand} ${entry.model}`
    : `${entry.brand} ${entry.model} ${year}年モデル${size ? ` ${size}サイズ` : ""}`;

  rows.push({
    seller_id: seller.id,
    status: Math.random() > 0.08 ? "published" : "sold",
    category: isParts ? "parts" : entry.category,
    parts_subcategory: isParts ? entry.sub : null,
    title,
    brand_id: brandByName.get(entry.brand),
    model_name: entry.model,
    model_year: year,
    frame_size: size,
    frame_size_cm: size ? randomInt(SIZE_CM[size][0], SIZE_CM[size][1]) : null,
    component: isParts ? null : (entry.component ?? null),
    mileage: isParts ? null : pick(MILEAGE_BY_CONDITION[condition]),
    condition,
    description: buildDescription({
      brand: entry.brand,
      model: entry.model,
      year,
      condition,
      delivery,
      pref,
      isParts,
    }),
    price: priceOf(entry.price, condition, year ?? THIS_YEAR - 2),
    delivery_method: delivery,
    shipping_from_pref: pref,
    meetup_pref: delivery === "in_person" ? pref : null,
    favorites_count: 0,
    // 過去に分散させる。すべて「今」だと出品のレート制限(10件/時)に掛かってしまう
    created_at: new Date(Date.now() - randomInt(1, 90) * 86400000).toISOString(),
    published_at: new Date(Date.now() - randomInt(0, 90) * 86400000).toISOString(),
  });
}

// 一括 INSERT はサイズ制限に当たるため分割する
const CHUNK = 200;
let inserted = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const { error } = await supabase.from("listings").insert(rows.slice(i, i + CHUNK));
  if (error) {
    console.error("INSERT 失敗:", error.message);
    process.exit(1);
  }
  inserted += Math.min(CHUNK, rows.length - i);
  process.stdout.write(`\r${inserted}/${rows.length} 件`);
}

console.log(`\n${inserted} 件のデモ商品を作成しました。`);
