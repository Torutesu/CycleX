/**
 * ブラウザ側で画像を縮小する(FR-03-1 / 05 非機能要件の「リサイズ・サムネイル」)。
 *
 * Storage の画像変換は有料プラン限定のため、アップロード前に長辺を揃えて
 * 原本が 10MB のまま Storage・OGP・next/image の初回最適化へ流れないようにする。
 * 配信サイズの最終調整は next/image が行う。
 */

export type ResizeOptions = {
  /** 長辺の上限(px) */
  maxEdge: number;
  /** 正方形に中央クロップするか(アイコン用) */
  square?: boolean;
  /** 出力形式。未対応ブラウザでは JPEG に落ちる */
  type?: "image/webp" | "image/jpeg";
  quality?: number;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした"));
    };
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * 縮小(必要なら正方形クロップ)した File を返す。
 * 元の画像が上限以下で小さければそのまま返す。処理に失敗しても元のファイルで続行する。
 */
export async function resizeImageFile(file: File, options: ResizeOptions): Promise<File> {
  const { maxEdge, square = false, type = "image/webp", quality = 0.85 } = options;

  try {
    const image = await loadImage(file);
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height) return file;

    const needsResize = Math.max(width, height) > maxEdge;
    const needsCrop = square && width !== height;
    // 既に十分小さく形も合っているなら再エンコードしない(画質を落とさない)
    if (!needsResize && !needsCrop && file.size <= 1.5 * 1024 * 1024) return file;

    const side = Math.min(width, height);
    const sx = square ? (width - side) / 2 : 0;
    const sy = square ? (height - side) / 2 : 0;
    const sourceW = square ? side : width;
    const sourceH = square ? side : height;
    const scale = Math.min(1, maxEdge / Math.max(sourceW, sourceH));
    const targetW = Math.round(sourceW * scale);
    const targetH = Math.round(sourceH * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, sx, sy, sourceW, sourceH, 0, 0, targetW, targetH);

    let blob = await toBlob(canvas, type, quality);
    let outputType = type;
    if (!blob || blob.type !== type) {
      // WebP 非対応(古い Safari など)は JPEG に落とす
      outputType = "image/jpeg";
      blob = await toBlob(canvas, outputType, quality);
    }
    if (!blob) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    const extension = outputType === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${base}.${extension}`, { type: outputType });
  } catch {
    return file;
  }
}
