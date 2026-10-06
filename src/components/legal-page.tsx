import type { ReactNode } from "react";

/**
 * 規約類の掲載枠。
 * 正式な支給原稿への差し替えまで、確認用ダミーであることを明示する。
 */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-bold">{title}</h1>
      <aside
        aria-label="ダミー文面のご案内"
        className="mt-4 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
      >
        <p className="font-bold">ダミー文面・確認用</p>
        <p>
          このページは画面確認用のサンプルです。正式な規約・方針・事業者情報ではありません。一般公開前に、運営者が確認した正式な文面へ差し替えます。
        </p>
        <p>仮の連絡先は利用できません。個人情報やお問い合わせを送信しないでください。</p>
      </aside>
      <div className="mt-6 space-y-6 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
