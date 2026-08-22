import Link from "next/link";
import { Button } from "@/components/ui/button";

// Phase 4 で新着・人気商品とカテゴリ導線を実装する(S-01)
export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-2xl font-bold">自転車とパーツを、探して、売る。</h1>
      <p className="mt-2 text-muted-foreground">
        フレームサイズやコンポーネントから、自分に合う一台を見つけられます。
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild className="h-11">
          <Link href="/search">商品をさがす</Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/sell">出品する</Link>
        </Button>
      </div>
    </div>
  );
}
