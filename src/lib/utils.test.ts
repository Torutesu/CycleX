import { describe, expect, it, vi, afterEach } from "vitest";
import { timeAgo, safeRedirectPath, formatPrice } from "@/lib/utils";

describe("timeAgo", () => {
  const now = new Date("2026-09-10T12:00:00+09:00");
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

  afterEach(() => vi.useRealTimers());

  function at(date: Date) {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    return timeAgo(date);
  }

  it("1分未満はたった今", () => {
    expect(at(ago(0))).toBe("たった今");
    expect(at(ago(0.5))).toBe("たった今");
  });

  it("時間の単位で切り替わる", () => {
    expect(at(ago(5))).toBe("5分前");
    expect(at(ago(59))).toBe("59分前");
    expect(at(ago(60))).toBe("1時間前");
    expect(at(ago(60 * 23))).toBe("23時間前");
  });

  it("日をまたぐと日数になる", () => {
    expect(at(ago(60 * 24))).toBe("昨日");
    expect(at(ago(60 * 24 * 3))).toBe("3日前");
  });

  it("1週間を超えたら日付に戻す", () => {
    expect(at(ago(60 * 24 * 7))).toMatch(/2026/);
  });

  it("値が無いときは空文字", () => {
    expect(timeAgo(null)).toBe("");
    expect(timeAgo(undefined)).toBe("");
    expect(timeAgo("not-a-date")).toBe("");
  });
});

describe("safeRedirectPath", () => {
  it("相対パスはそのまま通す", () => {
    expect(safeRedirectPath("/mypage")).toBe("/mypage");
  });

  it("外部 URL とプロトコル相対は既定値へ落とす", () => {
    expect(safeRedirectPath("https://evil.example.com")).toBe("/");
    expect(safeRedirectPath("//evil.example.com")).toBe("/");
    expect(safeRedirectPath("/\\evil.example.com")).toBe("/");
  });
});

describe("formatPrice", () => {
  it("3桁区切りで円を付ける", () => {
    expect(formatPrice(215000)).toBe("¥215,000");
  });
});
