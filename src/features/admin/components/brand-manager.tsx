"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/form/submit-button";
import { createBrand, renameBrand, toggleBrandActive } from "@/features/admin/actions";
import { formatDate } from "@/lib/utils";

type Brand = { id: string; name: string; is_active: boolean; created_at: string };

/** AD-06: ブランドマスタの追加・改名・有効/無効切り替え */
export function BrandManager({ brands }: { brands: Brand[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [createError, setCreateError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  async function handleCreate(formData: FormData) {
    const result = await createBrand(null, formData);
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setCreateError(null);
    toast.success("ブランドを追加しました");
    router.refresh();
  }

  async function handleRename(formData: FormData) {
    const result = await renameBrand(null, formData);
    if (!result.ok) {
      setRenameError(result.error);
      return;
    }
    setRenameError(null);
    setEditingId(null);
    toast.success("ブランド名を変更しました");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form action={handleCreate} className="rounded-xl border bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold">ブランドを追加</h2>
        {createError && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{createError}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Input
            name="name"
            maxLength={80}
            required
            placeholder="例: Trek"
            aria-label="ブランド名"
            className="h-11 max-w-xs"
          />
          <SubmitButton className="h-11" pendingLabel="追加中...">
            追加
          </SubmitButton>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border bg-background">
        <h2 className="border-b bg-muted/40 px-4 py-2.5 text-sm font-semibold">
          登録済みブランド
          <span className="ml-2 font-normal tabular-nums text-muted-foreground">
            {brands.length}
          </span>
        </h2>

        {renameError && (
          <Alert variant="destructive" className="m-4">
            <AlertDescription>{renameError}</AlertDescription>
          </Alert>
        )}

        <ul className="divide-y">
          {brands.map((brand) => (
            <li key={brand.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              {editingId === brand.id ? (
                <form action={handleRename} className="flex flex-1 items-center gap-2">
                  <input type="hidden" name="brandId" value={brand.id} />
                  <Input
                    name="name"
                    defaultValue={brand.name}
                    maxLength={80}
                    required
                    aria-label="ブランド名"
                    className="h-11 max-w-xs"
                    autoFocus
                  />
                  <Button type="submit" size="icon" className="size-11" aria-label="保存">
                    <Check className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label="編集をやめる"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{brand.name}</span>
                  {!brand.is_active && <Badge variant="secondary">無効</Badge>}
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatDate(brand.created_at)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`${brand.name} の名称を変更`}
                    onClick={() => setEditingId(brand.id)}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await toggleBrandActive(brand.id, !brand.is_active);
                        if (!result.ok) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success(brand.is_active ? "無効にしました" : "有効にしました");
                        router.refresh();
                      })
                    }
                  >
                    {brand.is_active ? "無効にする" : "有効にする"}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
