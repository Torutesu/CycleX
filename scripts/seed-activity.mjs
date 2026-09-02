/**
 * 画面確認用に、やりとり・取引・評価・通報のダミーを作る。
 *
 *   node scripts/seed-users.mjs && node scripts/seed-dev.mjs 120 && node scripts/seed-activity.mjs
 *
 * 空の一覧ばかりだと画面の作りを確認できないため、
 * 各ステータスが1件以上ある状態にする。本番環境では実行しないこと。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

const { data: users } = await db.from("users").select("id, email, display_name");
const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));
const buyer = byEmail["yamada@cyclex.test"];
const buyer2 = byEmail["sato@cyclex.test"];
if (!buyer || !buyer2) throw new Error("先に scripts/seed-users.mjs を実行してください");

/** 買い手以外が出していて、画像のある公開中の商品を取る */
async function pickListings(count, excludeSellerId) {
  const { data } = await db
    .from("listings")
    .select("id, title, price, seller_id, listing_images!inner(id)")
    .eq("status", "published")
    .neq("seller_id", excludeSellerId)
    .limit(count * 3);
  const seen = new Set();
  return (data ?? [])
    .filter((l) => (seen.has(l.id) ? false : seen.add(l.id)))
    .slice(0, count);
}

const listings = await pickListings(6, buyer.id);
if (listings.length < 6) throw new Error("ダミー商品が足りません");

// ---- やりとり ----
const talks = [
  ["こんにちは。こちらまだ販売中でしょうか。", "はい、販売中です。ご検討よろしくお願いします。", "ありがとうございます。フレームに目立つ傷はありますか？"],
  ["はじめまして。値下げのご相談は可能でしょうか。", "申し訳ありません、今のところ価格の変更は考えておりません。"],
];
let threadCount = 0;
for (const [index, listing] of listings.slice(0, 2).entries()) {
  const { data: thread } = await db
    .from("threads")
    .insert({ listing_id: listing.id, buyer_id: buyer.id, created_at: daysAgo(3 - index) })
    .select("id")
    .single();

  const lines = talks[index];
  for (const [i, body] of lines.entries()) {
    const fromBuyer = i % 2 === 0;
    await db.from("messages").insert({
      thread_id: thread.id,
      sender_id: fromBuyer ? buyer.id : listing.seller_id,
      body,
      created_at: daysAgo(3 - index - i * 0.1),
      // 最後の1通だけ未読にして、バッジの見え方を確認できるようにする
      read_at: i === lines.length - 1 && !fromBuyer ? null : daysAgo(0.5),
    });
  }
  await db.from("threads").update({ last_message_at: daysAgo(3 - index) }).eq("id", thread.id);
  threadCount += 1;
}

// ---- 取引 ----
const plan = [
  { status: "pending_payment", listingStatus: "trading", days: 0 },
  { status: "paid", listingStatus: "trading", days: 2, paid: true },
  { status: "shipped", listingStatus: "trading", days: 5, paid: true, shipped: true },
  { status: "completed", listingStatus: "sold", days: 12, paid: true, shipped: true, received: true },
];

const transactions = [];
for (const [index, step] of plan.entries()) {
  const listing = listings[index + 2];
  const row = {
    listing_id: listing.id,
    buyer_id: index % 2 === 0 ? buyer.id : buyer2.id,
    seller_id: listing.seller_id,
    price: listing.price,
    status: step.status,
    created_at: daysAgo(step.days),
    updated_at: daysAgo(0),
    ...(step.paid ? { paid_at: daysAgo(step.days) } : {}),
    ...(step.shipped ? { shipped_at: daysAgo(step.days - 1), shipping_note: "ヤマト運輸でお送りしました" } : {}),
    ...(step.received ? { received_at: daysAgo(step.days - 3), completed_at: daysAgo(step.days - 3) } : {}),
  };
  const { data: tx, error } = await db.from("transactions").insert(row).select("id, buyer_id, seller_id").single();
  if (error) throw error;

  await db.from("listings").update({ status: step.listingStatus }).eq("id", listing.id);
  await db.from("transaction_events").insert({
    transaction_id: tx.id,
    event: "created",
    actor_id: tx.buyer_id,
    created_at: daysAgo(step.days),
  });
  transactions.push({ ...tx, step });
}

// ---- 評価(完了した取引に相互評価) ----
const done = transactions.find((t) => t.step.status === "completed");
if (done) {
  await db.from("reviews").insert([
    {
      transaction_id: done.id,
      reviewer_id: done.buyer_id,
      reviewee_id: done.seller_id,
      rating: 5,
      comment: "梱包が丁寧で、状態も説明どおりでした。またお願いしたいです。",
      is_published: true,
      created_at: daysAgo(8),
    },
    {
      transaction_id: done.id,
      reviewer_id: done.seller_id,
      reviewee_id: done.buyer_id,
      rating: 5,
      comment: "スムーズにお取引いただきました。ありがとうございました。",
      is_published: true,
      created_at: daysAgo(8),
    },
  ]);
}

// ---- 通報 ----
await db.from("reports").insert({
  reporter_id: buyer2.id,
  target_type: "listing",
  target_id: listings[0].id,
  reason: "prohibited",
  detail: "防犯登録の記載がなく、盗難車の可能性があるように見えます。",
  status: "open",
  created_at: daysAgo(1),
});

console.log(`やりとり ${threadCount} 件、取引 ${transactions.length} 件、評価 2 件、通報 1 件を作成しました。`);
