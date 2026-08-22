"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { listingImageUrl, IMAGE_BUCKETS } from "@/lib/images";
import { ALLOWED_IMAGE_TYPES, IMAGE_MAX_BYTES, MAX_IMAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type ImageUploaderProps = {
  userId: string;
  value: string[];
  onChange: (paths: string[]) => void;
  error?: string[];
};

/**
 * FR-03-1: 商品画像(最大10枚)。
 * 選択と同時に Storage へアップロードし、フォームにはパスのみを保持する。
 * 並び替えはドラッグではなく左右ボタン方式(スマホ互換と実装コストのため)。
 */
export function ImageUploader({ userId, value, onChange, error }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    const remaining = MAX_IMAGES - value.length;
    if (remaining <= 0) {
      toast.error(`画像は${MAX_IMAGES}枚までです`);
      return;
    }

    const selected = Array.from(files).slice(0, remaining);
    if (files.length > remaining) {
      toast.warning(`残り${remaining}枚のみ追加しました`);
    }

    setUploading(true);
    const supabase = createClient();
    const uploaded: string[] = [];

    try {
      for (const file of selected) {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
          toast.error(`${file.name}: JPEG・PNG・WebP形式の画像を選択してください`);
          continue;
        }
        if (file.size > IMAGE_MAX_BYTES) {
          toast.error(`${file.name}: 1枚あたり10MB以内にしてください`);
          continue;
        }

        const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const objectPath = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(IMAGE_BUCKETS.listing)
          .upload(objectPath, file, { upsert: false, contentType: file.type });

        if (uploadError) {
          toast.error(`${file.name}: アップロードに失敗しました`);
          continue;
        }
        uploaded.push(objectPath);
      }

      if (uploaded.length > 0) onChange([...value, ...uploaded]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...value];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  async function remove(index: number) {
    const path = value[index];
    onChange(value.filter((_, i) => i !== index));
    // 参照が外れた画像は Storage からも消す
    const supabase = createClient();
    await supabase.storage.from(IMAGE_BUCKETS.listing).remove([path]);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {value.map((path, index) => (
          <figure
            key={path}
            className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
          >
            <Image
              src={listingImageUrl(path)}
              alt={`商品画像 ${index + 1}`}
              fill
              sizes="(max-width: 640px) 50vw, 200px"
              className="object-cover"
            />

            {index === 0 && (
              <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                メイン
              </span>
            )}

            <button
              type="button"
              onClick={() => void remove(index)}
              aria-label={`${index + 1}枚目を削除`}
              className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
            >
              <X className="size-4" aria-hidden />
            </button>

            <figcaption className="absolute inset-x-0 bottom-0 flex justify-between bg-background/85 p-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`${index + 1}枚目を前へ`}
                className="flex size-7 items-center justify-center rounded disabled:opacity-30"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === value.length - 1}
                aria-label={`${index + 1}枚目を後ろへ`}
                className="flex size-7 items-center justify-center rounded disabled:opacity-30"
              >
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </figcaption>
          </figure>
        ))}

        {value.length < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-muted-foreground transition-colors",
              "hover:border-primary hover:text-primary disabled:opacity-60",
            )}
          >
            {uploading ? (
              <Loader2 className="size-6 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="size-6" aria-hidden />
            )}
            <span className="text-xs">{uploading ? "アップロード中" : "画像を追加"}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) void handleFiles(event.target.files);
        }}
      />

      <p className="text-xs text-muted-foreground">
        最大{MAX_IMAGES}枚 / 1枚10MBまで(JPEG・PNG・WebP)。1枚目が一覧のサムネイルになります。
      </p>

      {error && error.length > 0 && (
        <ul className="space-y-0.5 text-xs text-destructive">
          {error.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {value.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 sm:hidden"
          disabled={uploading || value.length >= MAX_IMAGES}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-4" aria-hidden />
          画像を追加({value.length}/{MAX_IMAGES})
        </Button>
      )}
    </div>
  );
}
