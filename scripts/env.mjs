/**
 * スクリプトから Supabase に繋ぐための設定を読む。
 *
 * 手元では .env.local を使い、CI のように .env.local が無い環境では
 * 環境変数をそのまま使う。すでに環境変数がある場合はそちらを優先する
 * (一時的に別の接続先へ向けたいときに、ファイルを書き換えずに済む)。
 */
import { readFileSync } from "node:fs";

export function loadEnv() {
  const env = {};

  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(
      "\n",
    )) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 0) continue;
      env[trimmed.slice(0, separator).trim()] = trimmed
        .slice(separator + 1)
        .trim()
        .replace(/^"|"$/g, "");
    }
  } catch {
    // .env.local が無い環境では環境変数だけで動かす
  }

  return { ...env, ...pickDefined(process.env) };
}

function pickDefined(source) {
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== "") result[key] = value;
  }
  return result;
}

/** 接続に必要な値がそろっているかを確かめる */
export function requireSupabaseEnv() {
  const env = loadEnv();
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(
    (name) => !env[name],
  );

  if (missing.length > 0) {
    console.error(
      `${missing.join(" と ")} が見つかりません。` +
        ".env.local に書くか、環境変数として渡してください。",
    );
    process.exit(1);
  }

  return env;
}
