import type { ReactNode } from "react";

/**
 * 規約類の掲載枠。
 * 文面の作成は業務対象外(別紙1 3.(5))のため、甲支給の内容を差し込む器のみを用意する。
 */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-bold">{title}</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
