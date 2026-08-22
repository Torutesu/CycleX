import Link from "next/link";
import type { ReactNode } from "react";

/** 認証系ページ共通のカードシェル。スマホ幅を基準に中央寄せする。 */
export function AuthFormShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-10">
      <Link href="/" className="mb-6 text-center text-2xl font-bold text-primary">
        CycleX
      </Link>
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-bold">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-center text-sm">{footer}</div>}
    </div>
  );
}
