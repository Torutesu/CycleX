import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChevronLeft, RotateCw } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getThreadDetail } from "@/features/message/queries";
import { sendDisabledReason } from "@/features/message/rules";
import { Conversation } from "@/features/message/components/conversation";
import { MarkThreadRead } from "@/features/message/components/mark-read";
import { hasVisibleImage, listingImageUrl } from "@/lib/images";
import { formatPrice } from "@/lib/utils";
import { LISTING_STATUSES, labelOf } from "@/lib/constants";

export const metadata: Metadata = { title: "メッセージ" };

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const user = await requireUser(`/messages/${threadId}`);

  const thread = await getThreadDetail(threadId, user.id);
  if (!thread) notFound();

  const disabledReason =
    sendDisabledReason(thread.counterparty.status, thread.listing.status) ?? undefined;

  const statusLabel =
    thread.listing.status !== "published" ? labelOf(LISTING_STATUSES, thread.listing.status) : null;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-2xl flex-col px-0 md:px-4 md:py-4">
      {/* 商品ヘッダー */}
      <header className="sticky top-14 z-20 border-b bg-background/95 backdrop-blur md:top-16 md:rounded-t-xl md:border">
        <div className="flex items-center gap-2 px-3 py-2">
          <Link
            href="/messages"
            aria-label="メッセージ一覧へ戻る"
            className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-accent"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>

          <Link
            href={`/items/${thread.listing.id}`}
            className="flex min-w-0 flex-1 items-center gap-2.5"
          >
            {thread.listing.thumbnailPath && hasVisibleImage(thread.listing.status) && (
              <Image
                src={listingImageUrl(thread.listing.thumbnailPath)}
                alt=""
                width={40}
                height={40}
                className="size-10 shrink-0 rounded-md object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{thread.listing.title}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatPrice(thread.listing.price)}
                {statusLabel && <span className="ml-2">{statusLabel}</span>}
              </p>
            </div>
          </Link>

          {/* リアルタイム同期は行わないため、手動更新の導線を置く(FR-07) */}
          <Link
            href={`/messages/${threadId}`}
            aria-label="最新の状態に更新"
            className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-accent"
          >
            <RotateCw className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      <Conversation
        threadId={threadId}
        messages={thread.messages}
        counterpartyName={thread.counterparty.displayName}
        counterpartyWithdrawn={thread.counterparty.status === "withdrawn"}
        disabledReason={disabledReason}
      />

      <MarkThreadRead threadId={threadId} hasUnread={thread.hasUnread} />
    </div>
  );
}
