import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Storage の後始末(S2-2)。
 *
 * 参照が切れたオブジェクトは自動では消えないため、明示的に削除する。
 * ここでの失敗は業務処理を止めない — ゴミが残ることはあっても、
 * 削除できなかったせいで出品や退会が失敗する方が害が大きい。
 */

/** remove() に一度に渡す最大件数 */
const REMOVE_CHUNK = 100;
/** list() の1ページあたりの件数 */
const LIST_PAGE = 100;

/** 指定したパスのオブジェクトを削除する。失敗してもログのみ。 */
export async function removeStorageObjects(bucket: string, paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;

  const supabase = createAdminClient();
  let removed = 0;

  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK);
    const { error } = await supabase.storage.from(bucket).remove(chunk);

    if (error) {
      console.error("[storage remove failed]", bucket, error);
      continue;
    }
    removed += chunk.length;
  }

  return removed;
}

/**
 * 利用者のフォルダ配下をすべて削除する(退会時に使う)。
 * パス規約は `{bucket}/{userId}/{uuid}.{ext}`。
 */
export async function removeUserFolder(bucket: string, userId: string): Promise<number> {
  const supabase = createAdminClient();
  const paths: string[] = [];

  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(userId, { limit: LIST_PAGE, offset });

    if (error) {
      console.error("[storage list failed]", bucket, userId, error);
      break;
    }
    if (!data || data.length === 0) break;

    // フォルダ(id が null)は本アプリのパス規約では発生しないが、念のため除く
    paths.push(...data.filter((item) => item.id !== null).map((item) => `${userId}/${item.name}`));

    if (data.length < LIST_PAGE) break;
  }

  return removeStorageObjects(bucket, paths);
}
