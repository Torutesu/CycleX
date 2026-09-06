/**
 * 本番セットアップ用の SQL を組み立てる。
 *
 *   node scripts/build-hosted-sql.mjs
 *
 * supabase/migrations/ と seed.sql をつないで supabase/setup-hosted.sql を作る。
 * 手で貼り足していると、あとから足したマイグレーションが漏れて
 * 「ローカルでは動くのに本番だけ壊れる」ことになるため、生成に寄せる。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const migrationsDir = `${root}supabase/migrations`;
const output = `${root}supabase/setup-hosted.sql`;

const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const header = `-- ============================================================
-- CycleX 本番セットアップ(1回貼るだけ)
--
-- Supabase の SQL Editor に貼り付けて Run するだけで、
-- テーブル・権限・インデックス・Storage・初期データがすべて入る。
-- CLI のインストールもログインも不要。
--
-- 内容は supabase/migrations/ の${migrations.length}本 + seed.sql と同一。
-- このファイルは scripts/build-hosted-sql.mjs が生成する。直接編集しないこと。
-- マイグレーションを足したら node scripts/build-hosted-sql.mjs を実行する。
-- ============================================================
`;

const parts = [header];

for (const name of migrations) {
  parts.push(`

-- ############################################################
-- ${name}
-- ############################################################

${readFileSync(`${migrationsDir}/${name}`, "utf8").trimEnd()}
`);
}

parts.push(`

-- ############################################################
-- 初期データ(ブランド一覧) / seed.sql
-- ############################################################

${readFileSync(`${root}supabase/seed.sql`, "utf8").trimEnd()}
`);

const generated = `${parts.join("").trimEnd()}\n`;

// --check: 生成し直さずに、いまの中身と一致するかだけを見る(CI 用)
if (process.argv.includes("--check")) {
  const current = readFileSync(output, "utf8");
  if (current !== generated) {
    console.error(
      "supabase/setup-hosted.sql が supabase/migrations/ と合っていません。\n" +
        "node scripts/build-hosted-sql.mjs を実行して、生成結果をコミットしてください。",
    );
    process.exit(1);
  }
  console.log("supabase/setup-hosted.sql は最新です");
} else {
  writeFileSync(output, generated);
  console.log(
    `supabase/setup-hosted.sql を生成しました(マイグレーション ${migrations.length} 本 + seed)`,
  );
}
