import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * メーカーマスタ(出品フォームの選択肢)の見張り。
 *
 * 200件近くを手で並べたデータなので、綴り違いの重複や
 * カナの入れ忘れは目視では見つからない。
 * 重複したまま流すと insert 自体が落ちるため、テストで先に落とす。
 *
 * 資料が増えるたびにマイグレーションを足すので、
 * ファイル名を固定せず、brands に入れているものをすべて集めて見る。
 */

const MIGRATIONS_DIR = path.join("supabase", "migrations");
const INSERT_HEAD = "insert into public.brands (name, name_kana) values";

type Row = { name: string; kana: string; file: string };

function readMaster(): Row[] {
  const rows: Row[] = [];

  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const head = sql.indexOf(INSERT_HEAD);
    if (head < 0) continue;

    for (const match of sql.slice(head).matchAll(/^ {2}\('(.+?)', '(.+?)'\),?$/gm)) {
      rows.push({ name: match[1], kana: match[2], file });
    }
  }

  return rows;
}

/** 比較用のキー。大文字小文字と区切り文字の違いは同じものとみなす */
function key(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

describe("メーカーマスタ", () => {
  const rows = readMaster();

  it("十分な数のメーカーが載っている", () => {
    expect(rows.length).toBeGreaterThan(150);
  });

  it("メーカー名が重複していない(綴りのゆれも含む。別のマイグレーション間でも)", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const row of rows) {
      const existing = seen.get(key(row.name));
      if (existing) duplicates.push(`${existing} / ${row.name}(${row.file})`);
      else seen.set(key(row.name), row.name);
    }

    expect(duplicates).toEqual([]);
  });

  it("カナ読みが全件に付いていて、カタカナだけでできている", () => {
    const invalid = rows.filter((row) => !/^[ァ-ヶー・]+$/u.test(row.kana));
    expect(invalid).toEqual([]);
  });

  it("代表的なメーカーが漏れていない", () => {
    const names = new Set(rows.map((row) => key(row.name)));
    // ロード / MTB / クロスから1つずつ
    for (const name of [
      "Trek",
      "Specialized",
      "Giant",
      "Santa Cruz",
      "Yeti",
      "Bridgestone",
      "CENTURION",
      "MOMENTUM",
      "PEUGEOT",
    ]) {
      expect(names.has(key(name))).toBe(true);
    }
  });

  it("開発用シードのメーカーがすべてマスタにある", async () => {
    // seed-catalog.mjs は名前で brands を引く。綴りがずれると
    // E2E の「Seed demo data」で初めて落ちるので、ここで先に気づけるようにする
    const catalog: { BIKES: { brand: string }[]; PARTS: { brand: string }[] } =
      await import("../../../scripts/seed-catalog.mjs");
    const names = new Set(rows.map((row) => key(row.name)));
    const used = [...new Set([...catalog.BIKES, ...catalog.PARTS].map((entry) => entry.brand))];

    expect(used.length).toBeGreaterThan(20);
    expect(used.filter((name) => !names.has(key(name)))).toEqual([]);
  });

  it("旧 seed.sql の表記は、改名の対象として書かれている", () => {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, "20260101000012_brand_master.sql"), "utf8");
    const renames = sql.slice(0, sql.indexOf("insert into public.brands"));
    // 名前を寄せたぶんだけ、既存行の改名も用意されていないと重複して登録される
    for (const legacy of ["FUJI", "Merida", "Colnago", "RALEIGH", "KhodaaBloom", "YAMAHA"]) {
      expect(renames).toContain(`('${legacy}', '`);
    }
  });
});
