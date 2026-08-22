/**
 * 開発用のダミー商品を生成する。
 *
 *   node scripts/seed-dev.mjs [件数]
 *
 * .env.local の Supabase 設定を使い、既存ユーザーの出品として作成する。
 * 本番環境では実行しないこと。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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

const CATEGORIES = ["road", "cross", "mtb", "city", "minivelo", "ebike", "parts", "other"];
const PARTS_SUB = ["frame", "wheel", "component", "cockpit", "saddle", "pedal", "tire", "accessory"];
const CONDITIONS = ["new", "like_new", "good", "fair", "poor", "junk"];
const MILEAGES = ["lte100", "lte500", "lte1000", "lte3000", "lte5000", "gt5000", "unknown"];
const SIZES = ["XS", "S", "M", "L", "XL"];
const COMPONENTS = [
  "shimano_claris", "shimano_sora", "shimano_tiagra", "shimano_105",
  "shimano_ultegra", "shimano_dura_ace", "sram_rival", "campagnolo_chorus",
];
const MODELS = ["Emonda", "Domane", "Madone", "Tarmac", "Roubaix", "Defy", "TCR", "Synapse", "CAAD13", "Oltre"];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const { data: users } = await supabase.from("users").select("id, prefecture").eq("status", "active");
const { data: brands } = await supabase.from("brands").select("id, name").eq("is_active", true);

if (!users?.length || !brands?.length) {
  console.error("ユーザーまたはブランドが存在しません。先に会員登録してください。");
  process.exit(1);
}

const rows = [];
for (let i = 0; i < COUNT; i += 1) {
  const category = pick(CATEGORIES);
  const isParts = category === "parts";
  const brand = pick(brands);
  const model = pick(MODELS);
  const year = randomInt(2010, 2026);
  const seller = pick(users);
  const pref = String(randomInt(1, 47)).padStart(2, "0");
  const delivery = Math.random() > 0.25 ? "shipping" : "in_person";

  rows.push({
    seller_id: seller.id,
    status: Math.random() > 0.08 ? "published" : "sold",
    category,
    parts_subcategory: isParts ? pick(PARTS_SUB) : null,
    title: `${brand.name} ${model} ${year}年モデル${isParts ? " パーツ" : ` サイズ${pick(SIZES)}`}`,
    brand_id: brand.id,
    model_name: model,
    model_year: year,
    frame_size: isParts ? null : pick(SIZES),
    frame_size_cm: isParts ? null : randomInt(44, 60),
    component: pick(COMPONENTS),
    mileage: isParts ? null : pick(MILEAGES),
    condition: pick(CONDITIONS),
    description: `${brand.name} の ${model} です。${year}年モデル、通勤・週末ライドに使用していました。動作に問題はありません。写真をご確認のうえご検討ください。`,
    price: randomInt(3, 900) * 1000,
    delivery_method: delivery,
    shipping_from_pref: pref,
    meetup_pref: delivery === "in_person" ? pref : null,
    favorites_count: 0,
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

console.log(`\n${inserted} 件のダミー商品を作成しました。`);
