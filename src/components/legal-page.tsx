import type { ReactNode } from "react";

/**
 * 規約類の掲載枠。
 * 正式な支給原稿への差し替えまで(draft の間)、確認用ダミーであることを明示する。
 */
export function LegalPage({
  title,
  draft = true,
  children,
}: {
  title: string;
  /** 支給原稿に差し替えたページは false にして、ダミーの案内を外す */
  draft?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-bold">{title}</h1>
      {draft && (
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
      )}
      <div className="mt-6 space-y-6 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

/** 番号付きの項目。sub は項目の下に並べる箇条書き */
export type LegalItem = string | { text: string; sub: string[] };

/** 規約類の1条 */
export type LegalArticle = {
  heading: string;
  /** 項目の前に置く本文 */
  lead?: string[];
  items?: LegalItem[];
  /** 番号を振らない箇条書き(問い合わせ窓口など) */
  bullets?: string[];
};

/** 支給原稿の条文を、見出し・本文・番号付きの項目の形で並べる */
export function LegalArticles({ articles }: { articles: LegalArticle[] }) {
  return articles.map((article) => (
    <section key={article.heading} className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{article.heading}</h2>
      {article.lead?.map((text) => (
        <p key={text}>{text}</p>
      ))}
      {article.items && (
        <ol className="list-decimal space-y-1.5 pl-5">
          {article.items.map((item) =>
            typeof item === "string" ? (
              <li key={item}>{item}</li>
            ) : (
              <li key={item.text}>
                {item.text}
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {item.sub.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </li>
            ),
          )}
        </ol>
      )}
      {article.bullets && (
        <ul className="list-disc space-y-1 pl-5">
          {article.bullets.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
    </section>
  ));
}
