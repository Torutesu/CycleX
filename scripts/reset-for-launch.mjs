/**
 * 一般公開の前に、本番に入っている確認用のデータを片付ける。
 *
 *   node scripts/reset-for-launch.mjs --keep owner@example.com,staff@example.com
 *       → 何を消すかを表示するだけ(何も消さない)
 *   node scripts/reset-for-launch.mjs --keep owner@example.com,staff@example.com --apply
 *       → 実際に消す
 *
 * 公開前の本番にあるのは、デモ商品・テスト会員・動作確認の取引だけという前提。
 * 消すもの:
 *   - すべての商品と商品画像、お気に入り、メッセージ、取引、評価、通報、メール送信記録、管理操作の記録
 *   - --keep に挙げた以外のすべての会員(アカウントとプロフィール画像)
 * 残すもの:
 *   - --keep に挙げた会員(管理者にする先方のアカウントなど)。役割(管理者)もそのまま
 *   - ブランド一覧
 *
 * 元に戻せない。公開後(本物の利用者が使い始めたあと)には実行しないこと。
 */
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "./env.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const keepIndex = args.indexOf("--keep");
const keepEmails = new Set(
  (keepIndex >= 0 ? (args[keepIndex + 1] ?? "") : "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

if (keepEmails.size === 0) {
  console.error(
    "--keep に、残す会員のメールアドレスを1つ以上指定してください(管理者にするアカウントなど)。",
  );
  console.error("例: node scripts/reset-for-launch.mjs --keep owner@example.com");
  process.exit(1);
}

const env = requireSupabaseEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ALL = "00000000-0000-0000-0000-000000000000";

async function count(table) {
  const { count: n, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} を数えられません: ${error.message}`);
  return n ?? 0;
}

/** 全行を消す(PostgREST は条件なしの削除を受け付けないため、必ず真になる条件を付ける) */
async function deleteAll(table, column = "id") {
  const { error } = await db.from(table).delete().neq(column, ALL);
  if (error) throw new Error(`${table} を消せません: ${error.message}`);
}

/** バケット内の、指定したフォルダ(会員 ID)配下のファイルをすべて消す */
async function removeFolders(bucket, folders) {
  let removed = 0;
  for (const folder of folders) {
    for (;;) {
      const { data, error } = await db.storage.from(bucket).list(folder, { limit: 100 });
      if (error) throw new Error(`${bucket}/${folder} を読めません: ${error.message}`);
      const files = (data ?? []).filter((item) => item.id).map((item) => `${folder}/${item.name}`);
      if (files.length === 0) break;
      const { error: removeError } = await db.storage.from(bucket).remove(files);
      if (removeError) throw new Error(`${bucket} から消せません: ${removeError.message}`);
      removed += files.length;
    }
  }
  return removed;
}

async function rootFolders(bucket) {
  const folders = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.storage.from(bucket).list("", { limit: 100, offset });
    if (error) throw new Error(`${bucket} を読めません: ${error.message}`);
    // フォルダは id を持たない
    folders.push(...(data ?? []).filter((item) => !item.id).map((item) => item.name));
    if (!data || data.length < 100) break;
  }
  return folders;
}

// ---------------------------------------------------------------- 確認
const { data: users, error: usersError } = await db
  .from("users")
  .select("id, email, display_name, role");
if (usersError) throw new Error(`会員を読めません: ${usersError.message}`);

const kept = users.filter((user) => keepEmails.has(user.email.toLowerCase()));
const removedUsers = users.filter((user) => !keepEmails.has(user.email.toLowerCase()));
const missing = [...keepEmails].filter(
  (email) => !kept.some((user) => user.email.toLowerCase() === email),
);

console.log(`接続先: ${env.NEXT_PUBLIC_SUPABASE_URL}`);
console.log("");
console.log(`残す会員 ${kept.length} 人`);
for (const user of kept)
  console.log(`  ${user.email}  ${user.display_name}${user.role === "admin" ? "(管理者)" : ""}`);
if (missing.length > 0) {
  console.error(`\n--keep のうち、見つからないアドレスがあります: ${missing.join(", ")}`);
  console.error("綴りを確かめてください。何も消していません。");
  process.exit(1);
}
if (!kept.some((user) => user.role === "admin")) {
  console.error("\n残す会員に管理者がいません。片付けたあと管理画面に入れなくなるため、止めます。");
  console.error("先に、残すアカウントを管理者にしてください。何も消していません。");
  process.exit(1);
}

console.log(`\n消す会員 ${removedUsers.length} 人`);
for (const user of removedUsers.slice(0, 30)) console.log(`  ${user.email}  ${user.display_name}`);
if (removedUsers.length > 30) console.log(`  …ほか ${removedUsers.length - 30} 人`);

const TABLES = [
  ["listings", "商品"],
  ["listing_images", "商品画像"],
  ["favorites", "お気に入り"],
  ["threads", "メッセージのスレッド"],
  ["messages", "メッセージ"],
  ["transactions", "取引"],
  ["reviews", "評価"],
  ["reports", "通報・申告"],
  ["email_logs", "メール送信記録"],
  ["admin_audit_logs", "管理操作の記録"],
];
console.log("\nすべて消すもの");
for (const [table, label] of TABLES) console.log(`  ${label}: ${await count(table)} 件`);

if (!apply) {
  console.log("\n確認のみです。何も消していません。消すときは --apply を付けて実行してください。");
  process.exit(0);
}

// ---------------------------------------------------------------- 実行
// 参照される側が後になるよう、子から順に消す
console.log("\n消しています…");
const imageFolders = await rootFolders("listing-images");
const removedImages = await removeFolders("listing-images", imageFolders);

await deleteAll("reviews");
await deleteAll("transaction_events");
await deleteAll("transactions");
await deleteAll("messages");
await deleteAll("threads");
await deleteAll("favorites", "user_id");
await deleteAll("listing_images");
await deleteAll("listings");
await deleteAll("reports");
await deleteAll("email_logs");
await deleteAll("admin_audit_logs");

const removedAvatars = await removeFolders(
  "avatars",
  removedUsers.map((user) => user.id),
);

// アカウントを消すと、プロフィール(public.users)も一緒に消える
let failed = 0;
for (const user of removedUsers) {
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) {
    failed += 1;
    console.error(`  ${user.email} を消せません: ${error.message}`);
  }
}

console.log(`商品画像 ${removedImages} 枚、プロフィール画像 ${removedAvatars} 枚を消しました。`);
console.log(`会員 ${removedUsers.length - failed} 人を消しました。`);
for (const [table, label] of TABLES) console.log(`  ${label}: 残り ${await count(table)} 件`);
console.log(`会員: 残り ${await count("users")} 人`);
if (failed > 0) process.exit(1);
