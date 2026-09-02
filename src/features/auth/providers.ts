import "server-only";

import { cache } from "react";

/**
 * Supabase で有効になっている外部プロバイダを調べる。
 *
 * `signInWithOAuth` は無効なプロバイダでもリダイレクト先の URL を返してしまい、
 * 利用者は Supabase の生の JSON エラーに飛ばされる。
 * 設定される前に導線を出さないよう、描画時に確認する。
 *
 * `/auth/v1/settings` は匿名で読める公開エンドポイント。
 * 設定変更が反映されるまで最大 5 分かかるが、頻繁に変わる値ではない。
 */
type AuthSettings = { external?: Record<string, boolean> };

export const isGoogleLoginEnabled = cache(async function isGoogleLoginEnabled(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      next: { revalidate: 300 },
    });
    if (!response.ok) return false;

    const settings = (await response.json()) as AuthSettings;
    return settings.external?.google === true;
  } catch (error) {
    // 設定を読めないだけでログイン画面を壊さない
    console.error("[auth settings]", error);
    return false;
  }
});
