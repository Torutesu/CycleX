/**
 * 環境変数の読み取り。
 *
 * Vercel などの管理画面では「未設定」と「空のまま登録されている」の
 * 両方が起こりうる。素の参照だと後者を値として受け取ってしまい、
 * Number("") が 0 になる、空の送信元でメールを出そうとする、といった
 * 分かりにくい壊れ方をする。空白だけの登録も未設定として扱う。
 */
export function envValue(name: string): string | undefined {
  const trimmed = process.env[name]?.trim();
  return trimmed ? trimmed : undefined;
}

/** 設定されていなければ例外にする(無いと動かせないもの向け) */
export function requireEnv(name: string): string {
  const value = envValue(name);
  if (!value) throw new Error(`${name} が設定されていません`);
  return value;
}
