import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-5xl font-bold tabular-nums text-primary">404</p>
      <h1 className="mt-4 text-lg font-bold">ページが見つかりません</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        URL が変更されたか、商品が削除・非公開になった可能性があります。
      </p>
      <div className="mt-8 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Button asChild className="h-11">
          <Link href="/search">商品をさがす</Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/">ホームへ戻る</Link>
        </Button>
      </div>
    </div>
  );
}
