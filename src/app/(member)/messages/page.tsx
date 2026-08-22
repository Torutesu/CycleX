import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { MessageSquareDashed } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";
import { getThreadList } from "@/features/message/queries";
import { avatarImageUrl, listingImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "メッセージ" };

export default async function MessagesPage() {
  const user = await requireUser("/messages");
  const threads = await getThreadList(user.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-bold">メッセージ</h1>

      {threads.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <MessageSquareDashed className="size-10 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">やり取りはまだありません</p>
          <p className="mt-1 text-sm text-muted-foreground">
            気になる商品のページから、出品者に質問できます。
          </p>
          <Button asChild className="mt-6 h-11">
            <Link href="/search">商品をさがす</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-5 divide-y overflow-hidden rounded-xl border bg-card">
          {threads.map((thread) => {
            const avatarSrc = avatarImageUrl(thread.counterparty.avatarUrl, 80);
            const unread = thread.unreadCount > 0;

            return (
              <li key={thread.id}>
                <Link
                  href={`/messages/${thread.id}`}
                  className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/40"
                >
                  {avatarSrc ? (
                    <Image
                      src={avatarSrc}
                      alt=""
                      width={40}
                      height={40}
                      className="size-10 shrink-0 rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <Avatar className="size-10 shrink-0">
                      <AvatarFallback>{thread.counterparty.displayName.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p
                        className={cn(
                          "truncate text-sm",
                          unread ? "font-semibold" : "font-medium",
                        )}
                      >
                        {thread.counterparty.displayName}
                      </p>
                      {thread.lastMessage && (
                        <time className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(thread.lastMessage.createdAt), {
                            addSuffix: true,
                            locale: ja,
                          })}
                        </time>
                      )}
                    </div>

                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {thread.listing.title}
                    </p>

                    {thread.lastMessage && (
                      <p
                        className={cn(
                          "mt-1 truncate text-sm",
                          unread ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {thread.lastMessage.fromMe && (
                          <span className="text-muted-foreground">自分: </span>
                        )}
                        {thread.lastMessage.body}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {thread.listing.thumbnailPath && (
                      <Image
                        src={listingImageUrl(thread.listing.thumbnailPath, { width: 120 })}
                        alt=""
                        width={44}
                        height={44}
                        className="size-11 rounded-md object-cover"
                        unoptimized
                      />
                    )}
                    {unread && (
                      <span className="flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold leading-5 text-white">
                        {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
