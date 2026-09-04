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

/** 出品フォームで選んだが保存されなかった画像を回収する猶予(この時間より新しいものは残す) */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * listing_images に無い商品画像を Storage から削除する(日次)。
 *
 * 画像は選択と同時に Storage へ上がるため、保存せずに離脱した分が残り続ける。
 * 入力途中の分を消さないよう、作成から 24 時間以上たったものだけを対象にする。
 *
 * @returns 削除した件数
 */
export async function cleanupOrphanListingImages(): Promise<number> {
  const supabase = createAdminClient();
  const bucket = "listing-images";
  const cutoff = Date.now() - ORPHAN_GRACE_MS;
  let removed = 0;

  // 先頭フォルダは利用者 ID。フォルダを 1 ページずつたどる
  for (let folderOffset = 0; ; folderOffset += LIST_PAGE) {
    const { data: folders, error } = await supabase.storage
      .from(bucket)
      .list("", { limit: LIST_PAGE, offset: folderOffset });
    if (error) {
      console.error("[orphan cleanup] フォルダ一覧の取得に失敗", error);
      break;
    }
    if (!folders || folders.length === 0) break;

    for (const folder of folders) {
      if (folder.id !== null) continue; // フォルダのみ
      const candidates: string[] = [];

      for (let offset = 0; ; offset += LIST_PAGE) {
        const { data: objects, error: listError } = await supabase.storage
          .from(bucket)
          .list(folder.name, { limit: LIST_PAGE, offset });
        if (listError || !objects || objects.length === 0) break;
        for (const object of objects) {
          if (object.id === null) continue;
          const createdAt = object.created_at ? new Date(object.created_at).getTime() : 0;
          if (createdAt > cutoff) continue;
          candidates.push(`${folder.name}/${object.name}`);
        }
        if (objects.length < LIST_PAGE) break;
      }
      if (candidates.length === 0) continue;

      const { data: referenced } = await supabase
        .from("listing_images")
        .select("path")
        .in("path", candidates);
      const keep = new Set((referenced ?? []).map((row) => row.path));
      const orphans = candidates.filter((path) => !keep.has(path));
      removed += await removeStorageObjects(bucket, orphans);
    }

    if (folders.length < LIST_PAGE) break;
  }

  if (removed > 0) console.info(`[orphan cleanup] ${removed} 件の未使用画像を削除しました`);
  return removed;
}

/** 運営が非表示にした商品の画像を退避しておく非公開バケット */
export const HIDDEN_LISTING_BUCKET = "listing-images-hidden";
const LISTING_BUCKET = "listing-images";

/** 署名付き URL の有効期間(秒)。画面を開いている間に切れない程度に取る */
const SIGNED_URL_TTL = 60 * 60;

async function listingImagePaths(listingIds: string[]): Promise<string[]> {
  if (listingIds.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("listing_images")
    .select("path")
    .in("listing_id", listingIds);
  if (error) {
    console.error("[listing images fetch failed]", error);
    return [];
  }
  return (data ?? []).map((row) => row.path);
}

/**
 * バケット間でオブジェクトを移す。
 *
 * 1 件ずつ移し、失敗しても残りを続ける(すでに移動済みのものは失敗するが、
 * 再実行できるようにしておきたい)。
 *
 * @returns 移せた件数
 */
async function moveObjects(from: string, to: string, paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  const supabase = createAdminClient();
  let moved = 0;

  for (const path of paths) {
    const { error } = await supabase.storage.from(from).move(path, path, { destinationBucket: to });
    if (error) {
      // 見つからない = すでに移動済み。それ以外は記録して次へ
      console.warn("[storage move skipped]", from, "->", to, path, error.message);
      continue;
    }
    moved += 1;
  }

  return moved;
}

/** 非表示にした商品の画像を非公開バケットへ退避する */
export async function hideListingImages(listingIds: string[]): Promise<number> {
  const paths = await listingImagePaths(listingIds);
  return moveObjects(LISTING_BUCKET, HIDDEN_LISTING_BUCKET, paths);
}

/** 非表示を解除した商品の画像を公開バケットへ戻す */
export async function restoreListingImages(listingIds: string[]): Promise<number> {
  const paths = await listingImagePaths(listingIds);
  return moveObjects(HIDDEN_LISTING_BUCKET, LISTING_BUCKET, paths);
}

/**
 * 退避中の画像の署名付き URL。
 * 出品者本人と管理者だけが辿れる商品詳細で使う。
 */
export async function signedHiddenImageUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(HIDDEN_LISTING_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);

  if (error) {
    console.error("[signed url failed]", error);
    return [];
  }
  // 入力の順序を保ったまま、署名できなかったものは除く
  const urlByPath = new Map(
    (data ?? []).filter((item) => item.signedUrl).map((item) => [item.path ?? "", item.signedUrl]),
  );
  return paths.map((path) => urlByPath.get(path)).filter((url): url is string => Boolean(url));
}
