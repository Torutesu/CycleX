import { beforeAll, describe, expect, it } from "vitest";
import { avatarImageUrl, isOwnedImagePath } from "@/lib/images";

const USER = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

describe("isOwnedImagePath", () => {
  it("自分のフォルダ直下のファイルは受け入れる", () => {
    expect(isOwnedImagePath(`${USER}/abc.jpg`, USER)).toBe(true);
  });

  it("他人のフォルダは受け付けない", () => {
    expect(isOwnedImagePath(`${OTHER}/abc.jpg`, USER)).toBe(false);
  });

  it("フォルダを付けないパスは受け付けない", () => {
    expect(isOwnedImagePath("abc.jpg", USER)).toBe(false);
  });

  it("上位へ抜ける記法は受け付けない", () => {
    expect(isOwnedImagePath(`${USER}/../${OTHER}/abc.jpg`, USER)).toBe(false);
    expect(isOwnedImagePath(`${USER}/..`, USER)).toBe(false);
  });

  it("さらに下の階層は受け付けない(規約は 1 階層)", () => {
    expect(isOwnedImagePath(`${USER}/sub/abc.jpg`, USER)).toBe(false);
  });

  it("ファイル名が空なら受け付けない", () => {
    expect(isOwnedImagePath(`${USER}/`, USER)).toBe(false);
  });

  it("ID の前方一致だけでは通さない", () => {
    expect(isOwnedImagePath(`${USER}extra/abc.jpg`, USER)).toBe(false);
  });
});

describe("avatarImageUrl", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  });

  it("Storage のパスは公開 URL にする", () => {
    expect(avatarImageUrl("user-1/abc.jpg")).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/avatars/user-1/abc.jpg",
    );
  });

  it("Google のプロフィール画像はサブドメインを問わず通す", () => {
    expect(avatarImageUrl("https://lh3.googleusercontent.com/a/x")).toBe(
      "https://lh3.googleusercontent.com/a/x",
    );
    expect(avatarImageUrl("https://lh5.googleusercontent.com/a/x")).toBe(
      "https://lh5.googleusercontent.com/a/x",
    );
  });

  it("それ以外の外部 URL は既定アイコンに落とす(next/image が例外を投げるため)", () => {
    expect(avatarImageUrl("https://attacker.example/x.png")).toBeNull();
    expect(avatarImageUrl("http://lh3.googleusercontent.com/a/x")).toBeNull();
    expect(avatarImageUrl("https://evil.googleusercontent.com.attacker.example/x")).toBeNull();
  });

  it("空なら null", () => {
    expect(avatarImageUrl(null)).toBeNull();
    expect(avatarImageUrl("")).toBeNull();
  });
});
