import { describe, expect, it } from "vitest";
import { renderHtml, renderText } from "@/lib/email/template";

/**
 * メール本文には、利用者が書いた文字列(商品名・表示名・キャンセル理由など)が
 * そのまま入る。受信側のメーラーで解釈されないことを確かめる。
 */

const BODY = {
  intro: "ご購入ありがとうございます。",
  details: [
    { label: "商品", value: "Trek Émonda ALR 5" },
    { label: "金額", value: "¥162,000" },
  ],
  cta: { label: "取引画面をひらく", path: "/transactions/abc" },
  outro: "発送までしばらくお待ちください。",
};

describe("メール本文", () => {
  it("宛名・本文・詳細・導線がすべて入る", () => {
    const html = renderHtml("やまだ", BODY);
    expect(html).toContain("やまだ 様");
    expect(html).toContain("ご購入ありがとうございます。");
    expect(html).toContain("Trek Émonda ALR 5");
    expect(html).toContain("¥162,000");
    expect(html).toContain("取引画面をひらく");
    expect(html).toContain("/transactions/abc");
    expect(html).toContain("発送までしばらくお待ちください。");
  });

  it("テキスト版にも同じ内容が入る", () => {
    const text = renderText("やまだ", BODY);
    expect(text).toContain("やまだ 様");
    expect(text).toContain("商品: Trek Émonda ALR 5");
    expect(text).toContain("取引画面をひらく: ");
    expect(text).toContain("発送までしばらくお待ちください。");
  });

  it("利用者が書いた記号はそのまま解釈されない", () => {
    const html = renderHtml("<script>alert(1)</script>やまだ", {
      intro: "商品「<b>太字</b>」について",
      details: [{ label: "<i>ラベル</i>", value: '"引用符" & 記号 <tag>' }],
      cta: { label: "<u>開く</u>", path: "/transactions/x" },
      outro: "<img src=x onerror=alert(1)>",
    });

    // タグとして成立する形が残っていないこと(記号は文字として残ってよい)
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>太字</b>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<u>開く</u>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&quot;引用符&quot;");
    expect(html).toContain("&amp; 記号");
  });

  it("詳細も導線も無いときは、その部分を出さない", () => {
    const html = renderHtml("さとう", { intro: "お知らせです。" });
    expect(html).not.toContain("<table");
    expect(html).not.toContain("border-radius:8px;font-size:14px;font-weight:600");

    const text = renderText("さとう", { intro: "お知らせです。" });
    expect(text).toContain("さとう 様");
    expect(text).toContain("お知らせです。");
  });

  it("末尾には必ず送信元の断りと設定への案内が入る", () => {
    for (const rendered of [renderHtml("さとう", BODY), renderText("さとう", BODY)]) {
      expect(rendered).toContain("CycleX から自動送信");
      expect(rendered).toContain("/mypage/settings");
    }
  });
});
