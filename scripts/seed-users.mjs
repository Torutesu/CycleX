/**
 * 開発用のテスト会員を作る。
 *
 *   node scripts/seed-users.mjs
 *
 * メール確認済みの状態で作成するので、そのままログインできる。
 * 本番環境では実行しないこと。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync("./.env.local","utf8").split("\n")
  .filter(l=>l.includes("=")&&!l.trim().startsWith("#"))
  .map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const people = [
  ["admin@cyclex.test",  "パスワード123", "運営スタッフ", "13", true],
  ["yamada@cyclex.test", "パスワード123", "やまだ",       "13", false],
  ["sato@cyclex.test",   "パスワード123", "さとう",       "27", false],
  ["suzuki@cyclex.test", "パスワード123", "すずき",       "14", false],
  ["tanaka@cyclex.test", "パスワード123", "たなか",       "01", false],
];
console.log("メールアドレス          パスワード     表示名");
for (const [email, password, name, pref, isAdmin] of people) {
  const { data, error } = await sb.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: name },
  });
  if (error) { console.log(`${email}: ${error.message}`); continue; }
  await sb.from("users").update({
    display_name: name, prefecture: pref, bio: `${name}です。自転車が好きです。`,
    ...(isAdmin ? { role: "admin" } : {}),
  }).eq("id", data.user.id);
  console.log(`${email.padEnd(22)} ${password}  ${name}${isAdmin ? "  ← 管理者" : ""}`);
}
