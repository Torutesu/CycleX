import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * ブランドマスタ(出品フォームのメーカー選択)の見張り。
 *
 * 200件近くを手で並べたデータなので、綴り違いの重複や
 * カナの入れ忘れは目視では見つからない。
 * 重複したまま流すと insert 自体が落ちるため、テストで先に落とす。
 */

const MIGRATION = path.join("supabase", "migrations", "20260101000012_brand_master.sql");

type Row = { name: string; kana: string };

function readMaster(): Row[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const values = sql.slice(sql.indexOf("insert into public.brands (name, name_kana) values"));
  return [...values.matchAll(/^ {2}\('(.+?)', '(.+?)'\),?$/gm)].map((match) => ({
    name: match[1],
    kana: match[2],
  }));
}

/** 比較用のキー。大文字小文字と区切り文字の違いは同じものとみなす */
function key(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

describe("ブランドマスタ", () => {
  const rows = readMaster();

  it("十分な数のメーカーが載っている", () => {
    expect(rows.length).toBeGreaterThan(150);
  });

  it("ブランド名が重複していない(綴りのゆれも含む)", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const row of rows) {
      const existing = seen.get(key(row.name));
      if (existing) duplicates.push(`${existing} / ${row.name}`);
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
    for (const name of ["Trek", "Specialized", "Giant", "Santa Cruz", "Yeti", "Bridgestone"]) {
      expect(names.has(key(name))).toBe(true);
    }
  });

  it("旧 seed.sql の表記は、改名の対象として書かれている", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const renames = sql.slice(0, sql.indexOf("insert into public.brands"));
    // 名前を寄せたぶんだけ、既存行の改名も用意されていないと重複して登録される
    for (const legacy of ["FUJI", "Merida", "Colnago", "RALEIGH", "KhodaaBloom", "YAMAHA"]) {
      expect(renames).toContain(`('${legacy}', '`);
    }
  });
});
