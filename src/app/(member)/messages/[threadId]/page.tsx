import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChevronLeft, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/session";
import { getThreadDetail } from "@/features/message/queries";
import { markThreadRead } from "@/features/message/actions";
import { MessageComposer } from "@/features/message/components/message-composer";
import { ScrollToBottom } from "@/features/message/components/scroll-to-bottom";
import { listingImageUrl } from "@/lib/images";
import { formatPrice, formatDate, cn } from "@/lib/utils";
import { LISTING_STATUSES, labelOf } from "@/lib/constants";

export const metadata: Metadata = { title: "メッセージ" };

/** 日付の区切り線を入れるため、直前のメッセージと日付が変わったかを見る */
function isNewDay(current: string, previous: string | undefined): boolean {
  if (!previous) return true;
  return new Date(current).toDateString() !== new Date(previous).toDateString();
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const user = await requireUser(`/messages/${threadId}`);

  const thread = await getThreadDetail(threadId, user.id);
  if (!thread) notFound();

  // 表示と同時に相手発信の未読を既読にする
  await markThreadRead(threadId, user.id);

  const disabledReason =
    thread.counterparty.status === "withdrawn"
      ? "相手が退会済みのため、新しいメッセージは送信できません。"
      : thread.counterparty.status === "suspended"
        ? "相手のアカウントが利用停止中のため、新しいメッセージは送信できません。"
        : undefined;

  const statusLabel =
    thread.listing.status !== "published"
      ? labelOf(LISTING_STATUSES, thread.listing.status)
      : null;

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
            {thread.listing.thumbnailPath && (
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

      {/* 吹き出し */}
      <div className="flex-1 space-y-3 px-4 py-4 md:border-x">
        <p className="text-center text-xs text-muted-foreground">
          {thread.counterparty.displayName} さんとのやり取り
        </p>

        {thread.messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            まだメッセージはありません。
          </p>
        )}

        {thread.messages.map((message, index) => (
          <div key={message.id}>
            {isNewDay(message.createdAt, thread.messages[index - 1]?.createdAt) && (
              <p className="my-4 text-center text-xs text-muted-foreground">
                {formatDate(message.createdAt)}
              </p>
            )}
            <div className={cn("flex", message.fromMe ? "justify-end" : "justify-start")}>
              <div className="max-w-[80%]">
                <div
                  className={cn(
                    "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
                    message.fromMe
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted",
                  )}
                >
                  {message.body}
                </div>
                <time
                  className={cn(
                    "mt-0.5 block text-[10px] text-muted-foreground",
                    message.fromMe ? "text-right" : "text-left",
                  )}
                >
                  {new Date(message.createdAt).toLocaleTimeString("ja-JP", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            </div>
          </div>
        ))}

        {thread.counterparty.status === "withdrawn" && (
          <div className="pt-2 text-center">
            <Badge variant="secondary">相手は退会済みです</Badge>
          </div>
        )}

        <ScrollToBottom dependency={thread.messages.length} />
      </div>

      {/* 入力欄(スマホはタブバーの上に固定) */}
      <div className="sticky bottom-16 z-20 md:static md:rounded-b-xl md:border md:border-t-0">
        <MessageComposer threadId={threadId} disabledReason={disabledReason} />
      </div>
    </div>
  );
}
