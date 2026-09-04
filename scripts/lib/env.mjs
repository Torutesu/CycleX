import { readFileSync } from "node:fs";

/**
 * scripts/ 共通の .env.local 読み込み。
 *
 * これらのスクリプトは service role で DB を書き換える。DEPLOY.md の旧手順に
 * 「.env.local を本番の値に書き換えて実行」とあったため、本番に対して
 * ダミー会員や既知パスワードの管理者を作れる状態だった。
 * 接続先がローカル以外なら、明示的なフラグが無い限り実行を止める。
 */
export function loadEnv(url = new URL("../../.env.local", import.meta.url)) {
  let text = "";
  try {
    text = readFileSync(url, "utf8");
  } catch {
    // .env.local が無ければ環境変数だけを使う
  }
  const fromFile = Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [
          line.slice(0, i).trim(),
          line
            .slice(i + 1)
            .trim()
            .replace(/^"|"$/g, ""),
        ];
      }),
  );
  const env = { ...fromFile, ...process.env };
  assertLocalTarget(env);
  return env;
}

const LOCAL_HOSTS =
  /^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal|supabase_kong_[\w-]+)(:\d+)?\/?$/;

export function isLocalSupabaseUrl(value) {
  return typeof value === "string" && LOCAL_HOSTS.test(value);
}

/** 接続先がローカルの Supabase でなければ、明示フラグが無い限り終了する */
export function assertLocalTarget(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (isLocalSupabaseUrl(url)) return;
  const allowed =
    process.argv.includes("--allow-remote") || process.env.CYCLEX_ALLOW_REMOTE === "1";
  if (allowed) {
    console.warn(`[警告] ローカル以外の Supabase(${url})に対して実行します。`);
    return;
  }
  console.error(
    [
      `接続先がローカルの Supabase ではありません: ${url || "(未設定)"}`,
      "このスクリプトは DB を書き換えます。本番や検証環境に対して実行する場合は、",
      "内容を確認したうえで --allow-remote を付けるか CYCLEX_ALLOW_REMOTE=1 を設定してください。",
    ].join("\n"),
  );
  process.exit(1);
}
