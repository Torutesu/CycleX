import { describe, expect, it } from "vitest";
import { canSendMessage, canStartThread, roleInThread } from "@/features/message/rules";

const BUYER = "buyer-id";
const SELLER = "seller-id";
const OUTSIDER = "outsider-id";

describe("canSendMessage", () => {
  it("参加者は送信できる", () => {
    const thread = { buyerId: BUYER, sellerId: SELLER, counterpartyStatus: "active" as const };
    expect(canSendMessage(BUYER, thread).allowed).toBe(true);
    expect(canSendMessage(SELLER, thread).allowed).toBe(true);
  });

  it("参加していないユーザーは送信できない", () => {
    const result = canSendMessage(OUTSIDER, {
      buyerId: BUYER,
      sellerId: SELLER,
      counterpartyStatus: "active",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("参加していません");
  });

  it("相手が退会済みなら送信できない", () => {
    const result = canSendMessage(BUYER, {
      buyerId: BUYER,
      sellerId: SELLER,
      counterpartyStatus: "withdrawn",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("退会済み");
  });

  it("相手が利用停止中なら送信できない", () => {
    const result = canSendMessage(BUYER, {
      buyerId: BUYER,
      sellerId: SELLER,
      counterpartyStatus: "suspended",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("利用停止");
  });
});

describe("canStartThread", () => {
  it("公開中・取引中・売却済の商品には質問できる", () => {
    expect(canStartThread("published", SELLER, BUYER).allowed).toBe(true);
    expect(canStartThread("trading", SELLER, BUYER).allowed).toBe(true);
    expect(canStartThread("sold", SELLER, BUYER).allowed).toBe(true);
  });

  it("下書き・取下げ・非表示の商品には質問できない", () => {
    expect(canStartThread("draft", SELLER, BUYER).allowed).toBe(false);
    expect(canStartThread("withdrawn", SELLER, BUYER).allowed).toBe(false);
    expect(canStartThread("suspended", SELLER, BUYER).allowed).toBe(false);
  });

  it("自分の出品には質問できない", () => {
    const result = canStartThread("published", SELLER, SELLER);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("自分が出品");
  });
});

describe("roleInThread", () => {
  it("役割を判定する", () => {
    expect(roleInThread(BUYER, { buyerId: BUYER, sellerId: SELLER })).toBe("buyer");
    expect(roleInThread(SELLER, { buyerId: BUYER, sellerId: SELLER })).toBe("seller");
    expect(roleInThread(OUTSIDER, { buyerId: BUYER, sellerId: SELLER })).toBeNull();
  });
});
