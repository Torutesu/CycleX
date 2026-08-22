"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { sendMessage } from "@/features/message/actions";
import { MESSAGE_MAX } from "@/lib/constants";
import type { ActionResult } from "@/lib/errors";

type Props = {
  threadId: string;
  /** 相手が退会・利用停止のときは送信できない */
  disabledReason?: string;
};

/** M-08: スレッド下部の入力欄。送信後は router.refresh() で最新を取得する。 */
export function MessageComposer({ threadId, disabledReason }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult<undefined> | null, FormData>(
    sendMessage,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, router]);

  if (disabledReason) {
    return (
      <div className="border-t bg-muted/40 p-4 text-center text-sm text-muted-foreground">
        {disabledReason}
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex items-end gap-2 border-t bg-background p-3">
      <input type="hidden" name="threadId" value={threadId} />
      <Textarea
        name="body"
        rows={1}
        maxLength={MESSAGE_MAX}
        placeholder="メッセージを入力"
        aria-label="メッセージ"
        required
        className="max-h-32 min-h-11 flex-1 resize-none"
        onKeyDown={(event) => {
          // PC では Cmd/Ctrl + Enter で送信できるようにする
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <Button type="submit" size="icon" className="size-11 shrink-0" disabled={pending} aria-label="送信">
        <Send className="size-4" aria-hidden />
      </Button>
    </form>
  );
}
