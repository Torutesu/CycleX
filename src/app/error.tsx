"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[unhandled]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <TriangleAlert className="size-10 text-destructive" aria-hidden />
      <h1 className="mt-4 text-lg font-bold">問題が発生しました</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        一時的な不具合の可能性があります。時間をおいて再度お試しください。
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-muted-foreground">エラーID: {error.digest}</p>
      )}
      <div className="mt-8 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Button className="h-11" onClick={reset}>
          もう一度試す
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/">ホームへ戻る</Link>
        </Button>
      </div>
    </div>
  );
}
