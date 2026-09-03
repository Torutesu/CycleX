/**
 * 既存のデモ出品を、カタログに沿った内容へ書き換える。
 *
 *   node scripts/seed-refresh.mjs
 *
 * 以前の生成ではブランドと車種が無関係に組み合わされていた
 * (Pinarello の Madone がミニベロ など)。取引やメッセージが
 * ぶら下がっている出品は消せないので、値段・出品者・日付・状態は
 * そのままに、名前まわりだけを筋の通った内容へ差し替える。
 *
 * カテゴリが変わると画像の見出し(ROAD / MINIVELO など)が食い違うため、
 * 実行後は `node scripts/seed-images.mjs 200 --replace` で貼り直すこと。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { BIKES, PARTS, SIZE_CM, buildDescription } from "./seed-catalog.mjs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const url = process.env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

console.log("対象:", url);

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 値段に見合う車種を選ぶ。近いものが無ければ一番近い相場のものにする */
function entryForPrice(price, isParts) {
  const pool = isParts ? PARTS : BIKES;
  const fits = pool.filter((entry) => price >= entry.price[0] * 0.35 && price <= entry.price[1] * 1.1);
  if (fits.length > 0) return pick(fits);
  return pool.reduce((best, entry) => {
    const distance = Math.abs((entry.price[0] + entry.price[1]) / 2 - price);
    const bestDistance = Math.abs((best.price[0] + best.price[1]) / 2 - price);
    return distance < bestDistance ? entry : best;
  }, pool[0]);
}

const { data: brands } = await supabase.from("brands").select("id, name").eq("is_active", true);
const brandByName = new Map((brands ?? []).map((brand) => [brand.name, brand.id]));

const { data: listings } = await supabase
  .from("listings")
  .select("id, price, category, condition, delivery_method, model_year, shipping_from_pref")
  .order("created_at");

if (!listings?.length) {
  console.log("出品がありません。");
  process.exit(0);
}

let updated = 0;
for (const listing of listings) {
  const isParts = listing.category === "parts";
  const entry = entryForPrice(listing.price, isParts);
  const hasSize = !isParts && entry.sizes === undefined;
  const size = hasSize ? pick(Object.keys(SIZE_CM)) : null;
  const year = isParts ? null : (listing.model_year ?? randomInt(entry.since ?? 2014, 2025));

  const { error } = await supabase
    .from("listings")
    .update({
      category: isParts ? "parts" : entry.category,
      parts_subcategory: isParts ? entry.sub : null,
      title: isParts
        ? `${entry.brand} ${entry.model}`
        : `${entry.brand} ${entry.model} ${year}年モデル${size ? ` ${size}サイズ` : ""}`,
      brand_id: brandByName.get(entry.brand) ?? null,
      model_name: entry.model,
      model_year: year,
      frame_size: size,
      frame_size_cm: size ? randomInt(SIZE_CM[size][0], SIZE_CM[size][1]) : null,
      component: isParts ? null : (entry.component ?? null),
      // 説明文も車種に合わせて書き直す。名前だけ変えると中身と食い違う
      description: buildDescription({
        brand: entry.brand,
        model: entry.model,
        year,
        condition: listing.condition,
        delivery: listing.delivery_method,
        pref: listing.shipping_from_pref,
        isParts,
      }),
    })
    .eq("id", listing.id);

  if (error) {
    console.error("更新に失敗:", listing.id, error.message);
    process.exit(1);
  }
  updated += 1;
  process.stdout.write(`\r${updated}/${listings.length} 件`);
}

console.log(`\n${updated} 件を書き換えました。`);
