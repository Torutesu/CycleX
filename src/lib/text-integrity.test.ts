import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * 画面に出る文字が壊れていないことの見張り。
 *
 * 日本語だけの製品なので、キリル文字・ハングル・タイ文字・アラビア文字が
 * 混ざっていれば、まず書き間違いか文字化けである。
 * U+FFFD は文字コードの変換に失敗した跡そのもの。
 *
 * 一度混ざると目視では見つけにくく、そのまま公開されてしまうため、
 * テストで落とす。
 *
 * 判定に使う文字そのものはここに書かない(このファイル自身が引っかかる)。
 */

const ROOTS = ["src", "e2e", "scripts", "supabase", "docs"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".css", ".sql", ".md", ".json"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", ".temp"]);

/** 日本語の文章に紛れていたら、まず間違いと分かる文字 */
const SUSPECT = new RegExp("[\\u0400-\\u04ff\\u0590-\\u06ff\\u0e00-\\u0e7f\\uac00-\\ud7af\\ufffd]");

function collect(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, found);
    } else if (EXTENSIONS.has(path.extname(entry))) {
      found.push(full);
    }
  }
  return found;
}

describe("文字の健全性", () => {
  it("読めない文字が混ざっていない", () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of collect(root)) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, index) => {
            if (SUSPECT.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
          });
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
