"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Eye, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteDraft, republishListing, withdrawListing } from "@/features/listing/actions";
import {
  canDeleteListing,
  canEditListing,
  canRepublishListing,
  canWithdrawListing,
} from "@/features/listing/rules";
import type { ListingStatus } from "@/lib/constants";

type Props = {
  listingId: string;
  status: ListingStatus;
  title: string;
};

/** 出品管理一覧の行操作(編集 / 取下げ / 再公開 / 削除) */
export function ListingRowActions({ listingId, status, title }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "操作に失敗しました");
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  const editable = canEditListing(status);
  const withdrawable = canWithdrawListing(status);
  const republishable = canRepublishListing(status);
  const deletable = canDeleteListing(status);

  if (!editable && !withdrawable && !republishable && !deletable) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11" aria-label={`${title} の操作`}>
            <MoreHorizontal className="size-5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {editable && (
            <DropdownMenuItem asChild>
              <Link href={`/sell/${listingId}/edit`}>
                <Pencil className="size-4" aria-hidden />
                編集する
              </Link>
            </DropdownMenuItem>
          )}
          {withdrawable && (
            <DropdownMenuItem
              disabled={pending}
              onSelect={() => run(() => withdrawListing(listingId), "取下げました")}
            >
              <EyeOff className="size-4" aria-hidden />
              取下げる
            </DropdownMenuItem>
          )}
          {republishable && (
            <DropdownMenuItem
              disabled={pending}
              onSelect={() => run(() => republishListing(listingId), "再公開しました")}
            >
              <Eye className="size-4" aria-hidden />
              再公開する
            </DropdownMenuItem>
          )}
          {deletable && (
            <DropdownMenuItem
              variant="destructive"
              disabled={pending}
              onSelect={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" aria-hidden />
              削除する
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>下書きを削除しますか?</DialogTitle>
            <DialogDescription>
              「{title || "無題の下書き"}
              」を削除します。アップロード済みの画像も削除され、元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="h-11" onClick={() => setConfirmDelete(false)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              className="h-11"
              disabled={pending}
              onClick={() => {
                setConfirmDelete(false);
                run(() => deleteDraft(listingId), "下書きを削除しました");
              }}
            >
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
