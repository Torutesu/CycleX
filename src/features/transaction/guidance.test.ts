import { describe, expect, it } from "vitest";
import { waitingNotice } from "@/features/transaction/guidance";

describe("waitingNotice", () => {
  it("入金後の購入者にはお届け先を伝えるよう促す(配送)", () => {
    const notice = waitingNotice("paid", "buyer", "shipping", false);
    expect(notice.title).toBe("お届け先をお伝えください");
    expect(notice.showMessageLink).toBe(true);
    expect(notice.detail).toContain("住所");
  });

  it("対面のときは待ち合わせの相談を促す", () => {
    const notice = waitingNotice("paid", "buyer", "in_person", false);
    expect(notice.title).toBe("受渡の日時と場所をご相談ください");
    expect(notice.showMessageLink).toBe(true);
    expect(notice.detail).not.toContain("住所");
  });

  it("入金後の出品者には連絡を促す", () => {
    expect(waitingNotice("paid", "seller", "shipping", false)).toEqual({
      title: "発送・受渡のご連絡をお願いします",
    });
  });

  it("支払い待ちは役割で出し分ける", () => {
    expect(waitingNotice("pending_payment", "seller", "shipping", false).title).toBe(
      "購入者のお支払いをお待ちください",
    );
    expect(waitingNotice("pending_payment", "buyer", "shipping", false).title).toBe(
      "お支払いの確認中です",
    );
  });

  it("発送済みは購入者の受取確認待ち", () => {
    expect(waitingNotice("shipped", "seller", "shipping", false).title).toBe(
      "購入者の受取確認をお待ちください",
    );
  });

  it("評価済みなら相手の評価待ち", () => {
    expect(waitingNotice("received", "buyer", "shipping", true).title).toBe(
      "相手の評価をお待ちください",
    );
  });

  it("待つだけの場面ではメッセージ導線を出さない", () => {
    for (const status of ["pending_payment", "shipped", "received"]) {
      expect(waitingNotice(status, "seller", "shipping", true).showMessageLink).toBeUndefined();
    }
  });
});

describe("waitingNotice(着払い)", () => {
  it("着払いも配送として扱い、お届け先を伝えるよう促す", () => {
    const notice = waitingNotice("paid", "buyer", "shipping_cod", false);
    // 対面側に落ちると「待ち合わせの相談」になり、発送されないまま止まる
    expect(notice.title).toBe("お届け先をお伝えください");
    expect(notice.showMessageLink).toBe(true);
    expect(notice.detail).toContain("住所");
  });

  it("着払いのときは送料の支払い先を添える", () => {
    const notice = waitingNotice("paid", "buyer", "shipping_cod", false);
    expect(notice.detail).toContain("着払い");
    expect(notice.detail).toContain("配送業者");
  });

  it("送料込みのときは着払いの案内を出さない", () => {
    const notice = waitingNotice("paid", "buyer", "shipping", false);
    expect(notice.detail).not.toContain("着払い");
  });
});
