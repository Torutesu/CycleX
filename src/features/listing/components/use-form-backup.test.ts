import { describe, expect, it } from "vitest";
import { backupKey, sanitizeBackup, shouldBackup } from "./use-form-backup";

describe("shouldBackup", () => {
  it("新規作成の入力途中だけ控えを取る", () => {
    expect(shouldBackup(undefined, undefined)).toBe(true);
    expect(shouldBackup(null, null)).toBe(true);
  });

  it("編集画面では控えを取らない", () => {
    expect(shouldBackup("listing-1", "listing-1")).toBe(false);
  });

  it("下書き保存で id が付いた後は保存を止める(公開済み商品の上書き事故を防ぐ)", () => {
    expect(shouldBackup(undefined, "listing-1")).toBe(false);
  });
});

describe("sanitizeBackup", () => {
  it("控えに id が混じっていても取り除く", () => {
    expect(sanitizeBackup({ id: "listing-1", title: "Trek" })).toEqual({
      id: undefined,
      title: "Trek",
    });
  });
});

describe("backupKey", () => {
  it("利用者ごとに別のキーになる", () => {
    expect(backupKey("new", "user-a")).not.toBe(backupKey("new", "user-b"));
    expect(backupKey("new", "user-a")).toBe("new:user-a");
  });
});
