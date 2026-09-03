"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sendMessage } from "@/features/message/actions";
import { ScrollToBottom } from "@/features/message/components/scroll-to-bottom";
import { MESSAGE_MAX } from "@/lib/constants";
import { formatDate, formatTime, cn } from "@/lib/utils";

export type Bubble = {
  id: string;
  body: string;
  createdAt: string;
  fromMe: boolean;
};

type Props = {
  threadId: string;
  messages: Bubble[];
  counterpartyName: string;
  /** 相手が退会済みなら、やり取りの末尾でも知らせる */
  counterpartyWithdrawn: boolean;
  /** 相手が退会・利用停止のときは送信できない */
  disabledReason?: string;
};

/** 残り文字数を出し始める位置。常に出すと入力の邪魔になる */
const COUNTER_FROM = MESSAGE_MAX - 100;

/** 直前のメッセージと日付が変わったら区切り線を入れる(日本時間で判定する) */
function isNewDay(current: string, previous: string | undefined): boolean {
  if (!previous) return true;
  return formatDate(current) !== formatDate(previous);
}

/**
 * M-08: 吹き出しと入力欄。
 *
 * 送信は往復に時間がかかるため、まず自分の吹き出しを出してから
 * 結果を待つ。失敗したときは入力していた文面を戻す。
 */
export function Conversation({
  threadId,
  messages,
  counterpartyName,
  counterpartyWithdrawn,
  disabledReason,
}: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [bubbles, addBubble] = useOptimistic(messages, (current: Bubble[], body: string) => [
    ...current,
    { id: `sending-${current.length}`, body, createdAt: new Date().toISOString(), fromMe: true },
  ]);

  function submit() {
    const body = draft.trim();
    if (!body || pending) return;
    setDraft("");

    // 楽観表示は transition の間だけ残る。router.refresh() も同じ中で待つことで、
    // 本物の吹き出しが届くまで自分の発言が消えないようにする。
    startTransition(async () => {
      addBubble(body);

      const formData = new FormData();
      formData.set("threadId", threadId);
      formData.set("body", body);

      // 通信そのものが失敗すると例外になる。拾わないと画面全体が
      // エラー表示に差し替わってしまうので、ここで失敗として扱う。
      const result = await sendMessage(null, formData).catch(() => ({
        ok: false as const,
        error: "通信に失敗しました。電波の状況をご確認のうえ、もう一度お試しください。",
      }));

      if (!result.ok) {
        toast.error(result.error);
        // 打ち直しにならないよう文面を戻す
        setDraft(body);
        textareaRef.current?.focus();
        return;
      }
      router.refresh();
    });
  }

  const remaining = MESSAGE_MAX - draft.length;

  return (
    <>
      <div className="flex-1 space-y-3 px-4 py-4 md:border-x">
        <h1 className="text-center text-xs text-muted-foreground">
          {counterpartyName} さんとのやり取り
        </h1>

        {bubbles.length === 0 && (
          <p className="py-8 text-center text-sm leading-relaxed text-muted-foreground">
            まだメッセージはありません。
            <br />
            気になる点があれば、購入前にこちらから確認できます。
          </p>
        )}

        {bubbles.map((message, index) => {
          const sending = message.id.startsWith("sending-");
          return (
            <div key={message.id}>
              {isNewDay(message.createdAt, bubbles[index - 1]?.createdAt) && (
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
                      sending && "opacity-60",
                    )}
                  >
                    {message.body}
                  </div>
                  <time
                    dateTime={message.createdAt}
                    className={cn(
                      "mt-0.5 block text-[10px] text-muted-foreground",
                      message.fromMe ? "text-right" : "text-left",
                    )}
                  >
                    {sending ? "送信中…" : formatTime(message.createdAt)}
                  </time>
                </div>
              </div>
            </div>
          );
        })}

        {counterpartyWithdrawn && (
          <div className="pt-2 text-center">
            <Badge variant="secondary">相手は退会済みです</Badge>
          </div>
        )}

        <ScrollToBottom dependency={bubbles.length} />
      </div>

      {/* 入力欄(スマホはタブバーの上に固定) */}
      <div className="sticky bottom-16 z-20 md:static md:rounded-b-xl md:border md:border-t-0">
        {disabledReason ? (
          <div className="border-t bg-muted/40 p-4 text-center text-sm text-muted-foreground">
            {disabledReason}
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="flex items-end gap-2 border-t bg-background p-3"
          >
            <div className="flex-1">
              <Textarea
                ref={textareaRef}
                name="body"
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={MESSAGE_MAX}
                placeholder="メッセージを入力"
                aria-label="メッセージ"
                className="max-h-32 min-h-11 w-full resize-none"
                onKeyDown={(event) => {
                  // PC では Cmd/Ctrl + Enter で送信できるようにする
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              {draft.length > COUNTER_FROM && (
                <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">
                  あと{remaining}文字
                </p>
              )}
            </div>
            <Button
              type="submit"
              size="icon"
              className="size-11 shrink-0"
              disabled={pending || draft.trim().length === 0}
              aria-label="送信"
            >
              <Send className="size-4" aria-hidden />
            </Button>
          </form>
        )}
      </div>
    </>
  );
}
