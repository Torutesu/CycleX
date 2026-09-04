/**
 * supabase/setup-hosted.sql を migrations + seed.sql から生成する。
 *
 *   node scripts/gen-setup-hosted.mjs
 *
 * 手で編集すると migrations と食い違うので、マイグレーションを足したら必ず再生成する
 * (CI で同一性を確認する)。Supabase の SQL Editor に貼って一度だけ実行する想定。
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const migrationsDir = new URL("supabase/migrations/", root);
const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const header = `-- ============================================================
-- CycleX 本番セットアップ(更地に一度だけ貼る)
--
-- Supabase の SQL Editor に貼り付けて Run するだけで、
-- テーブル・権限・インデックス・Storage・初期データがすべて入る。
-- CLI のインストールもログインも不要。
--
-- 内容は supabase/migrations/ の ${files.length} 本 + seed.sql と同一。
-- このファイルは scripts/gen-setup-hosted.mjs で生成する(手で編集しない。CI で同一性を確認する)。
--
-- 注意: create table は冪等ではないため、2 回目の実行は失敗する。
--       以後の変更は supabase CLI(db push)で適用する。末尾で schema_migrations に
--       適用済みとして記録するので、CLI と併用しても同じマイグレーションを二重に流さない。
-- ============================================================

-- 再実行できるよう、Storage のポリシーは先に落としておく
drop policy if exists "cyclex_images_read"        on storage.objects;
drop policy if exists "cyclex_images_insert_own"  on storage.objects;
drop policy if exists "cyclex_images_update_own"  on storage.objects;
drop policy if exists "cyclex_images_delete_own"  on storage.objects;
`;

const sections = files.map((name) => {
  const body = readFileSync(new URL(name, migrationsDir), "utf8").trimEnd();
  return `\n\n-- ############################################################\n-- ${name}\n-- ############################################################\n\n${body}\n`;
});

const seed = readFileSync(new URL("supabase/seed.sql", root), "utf8").trimEnd();
const seedSection = `\n\n-- ############################################################\n-- 初期データ(ブランド一覧) / seed.sql\n-- ############################################################\n\n${seed}\n`;

const versions = files.map((name) => {
  const [version, ...rest] = name.replace(/\.sql$/, "").split("_");
  return { version, name: rest.join("_") };
});
const migrationLog = `\n\n-- ############################################################
-- CLI(supabase db push)と併用できるよう、適用済みとして記録する
-- ############################################################

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
insert into supabase_migrations.schema_migrations (version, name)
values
${versions.map((v) => `  ('${v.version}', '${v.name}')`).join(",\n")}
on conflict (version) do nothing;
`;

const output = header + sections.join("") + seedSection + migrationLog;
writeFileSync(new URL("supabase/setup-hosted.sql", root), output);
console.log(`supabase/setup-hosted.sql を生成しました(${files.length} migrations)`);
