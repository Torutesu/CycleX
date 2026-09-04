import { beforeAll, describe, expect, it } from "vitest";
import { escapeHtml, renderHtml, renderText } from "@/lib/email/template";

describe("escapeHtml", () => {
  it("HTML として意味を持つ文字をすべて実体参照にする", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;",
    );
  });
});

describe("renderHtml / renderText", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://cyclex.example.jp";
  });

  const body = {
    intro: "発送しました <b>",
    details: [{ label: "追跡番号", value: '1234 & "5678"' }],
    cta: { label: "取引を見る", path: "/transactions/1" },
    outro: "よろしくお願いします",
  };

  it("利用者が入力した文字列を HTML に混ぜない", () => {
    const html = renderHtml("田野", body);
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&quot;5678&quot;");
    expect(html).toContain("https://cyclex.example.jp/transactions/1");
  });

  it("テキスト版は本文をそのまま含む", () => {
    const text = renderText("田野", body);
    expect(text).toContain("発送しました <b>");
    expect(text).toContain("https://cyclex.example.jp/transactions/1");
  });
});
