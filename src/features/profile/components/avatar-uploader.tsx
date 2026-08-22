"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { updateAvatar } from "@/features/profile/actions";
import { avatarImageUrl, IMAGE_BUCKETS } from "@/lib/images";
import { ALLOWED_IMAGE_TYPES, AVATAR_MAX_BYTES } from "@/lib/constants";

type AvatarUploaderProps = {
  userId: string;
  displayName: string;
  currentPath: string | null;
};

/** FR-02: アイコン画像のアップロード。正方形にクロップして表示する。 */
export function AvatarUploader({ userId, displayName, currentPath }: AvatarUploaderProps) {
  const [path, setPath] = useState(currentPath);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = avatarImageUrl(path, 240);

  async function handleFile(file: File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      toast.error("JPEG・PNG・WebP形式の画像を選択してください");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("画像サイズは5MB以内にしてください");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const objectPath = `${userId}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(IMAGE_BUCKETS.avatar)
        .upload(objectPath, file, { upsert: false, contentType: file.type });

      if (uploadError) {
        toast.error("アップロードに失敗しました");
        return;
      }

      const result = await updateAvatar(objectPath);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      // 差し替え前の画像は残さない
      if (path) {
        await supabase.storage.from(IMAGE_BUCKETS.avatar).remove([path]);
      }

      setPath(objectPath);
      toast.success("アイコンを更新しました");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      const result = await updateAvatar(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (path) {
        const supabase = createClient();
        await supabase.storage.from(IMAGE_BUCKETS.avatar).remove([path]);
      }
      setPath(null);
      toast.success("アイコンを削除しました");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative size-20 shrink-0">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="現在のアイコン"
            width={80}
            height={80}
            className="size-20 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <Avatar className="size-20">
            <AvatarFallback className="text-xl">{displayName.slice(0, 1) || "U"}</AvatarFallback>
          </Avatar>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="size-4" aria-hidden />
          画像を選ぶ
        </Button>
        {path && (
          <Button
            type="button"
            variant="ghost"
            className="h-11 text-muted-foreground"
            disabled={uploading}
            onClick={() => void handleRemove()}
          >
            <Trash2 className="size-4" aria-hidden />
            削除
          </Button>
        )}
      </div>
    </div>
  );
}
