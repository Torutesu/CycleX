// helpers.ts を通して読み込む。接続先がローカルの Supabase でなければ
// import の時点で throw するので、このファイルが本番の記録を消すことはない。
import { adminDb } from "./helpers";

/**
 * 実行前にレート制限の記録を空にする。
 *
 * ログインは 1 アドレスあたり 10 回 / 10 分、同一 IP から 30 回 / 10 分に
 * 制限している(issue #8)。E2E は 1 本のスイートで何度もログインし直すため、
 * 10 分以内に 2 回流すと IP 側の枠を使い切り、ログイン画面で
 * 「混雑しています」に阻まれる。落ちるのは毎回違うテストで、症状は
 * `waitForURL` のタイムアウトになるため、レート制限が原因だと気づきにくい。
 *
 * CI は毎回まっさらな DB で 1 回流すだけなので影響を受けないが、
 * 手元で流し直すときに無関係な赤が出るのを防ぐ。
 */
export default async function globalSetup(): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  // id は 1 から始まるので、この条件で全件に当たる(PostgREST は無条件の
  // DELETE を受け付けないため、消す意図を条件で表す)
  const { error } = await adminDb().from("rate_limit_hits").delete().gte("id", 0);

  // テーブルが無い(移行前の DB)ときは黙って進む。E2E 自体は止めない
  if (error && !/does not exist/i.test(error.message)) {
    console.warn("[e2e] レート制限の記録を消せませんでした:", error.message);
  }
}
