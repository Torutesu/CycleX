import Link from "next/link";

const LINKS = [
  { href: "/terms", label: "利用規約" },
  { href: "/privacy", label: "プライバシーポリシー" },
  { href: "/tokushoho", label: "特定商取引法に基づく表記" },
] as const;

/** 共通フッター。規約類の文面は甲支給のため、掲載枠のみを用意する。 */
export function Footer() {
  return (
    <footer className="mt-16 border-t bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-lg font-bold text-primary">CycleX</p>
        <p className="mt-1 text-sm text-muted-foreground">
          自転車・パーツの個人間売買マーケットプレイス
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="text-muted-foreground hover:text-foreground">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} CycleX
        </p>
      </div>
    </footer>
  );
}
