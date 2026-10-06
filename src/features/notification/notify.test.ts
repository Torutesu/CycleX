import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyPaid,
  notifyShipped,
  notifyReceived,
  notifyReviewRequested,
  notifyCompleted,
  notifyCanceled,
} from "./notify";
import { MAIL_KINDS } from "@/lib/email/kinds";
import { renderHtml, renderText } from "@/lib/email/template";

const mocks = vi.hoisted(() => ({ send: vi.fn(), delivery: "shipping", missing: false }));
vi.mock("@/lib/email/send", () => ({ sendMail: mocks.send, findLastSentAt: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: mocks.missing
              ? null
              : {
                  id: "tx-test",
                  buyer_id: "buyer",
                  seller_id: "seller",
                  price: 500,
                  shipping_note: "追跡番号：1234",
                  listings: { title: "テスト自転車 <script>", delivery_method: mocks.delivery },
                },
          }),
        }),
      }),
    }),
  }),
}));

beforeEach(() => {
  mocks.send.mockReset();
  mocks.delivery = "shipping";
  mocks.missing = false;
});

describe("取引通知の宛先・状態・日本語文面", () => {
  it.each(["shipping", "in_person"])(
    "購入通知は双方に送り、%s の次の行動を案内する",
    async (method) => {
      mocks.delivery = method;
      await notifyPaid("tx-test");
      expect(mocks.send).toHaveBeenCalledTimes(2);
      const [seller, buyer] = mocks.send.mock.calls.map(([mail]) => mail);
      expect(seller).toMatchObject({
        userId: "seller",
        kind: "listing_paid_seller",
        refId: "tx-test",
      });
      expect(buyer).toMatchObject({
        userId: "buyer",
        kind: "purchase_confirmed",
        refId: "tx-test",
      });
      if (method === "shipping") {
        expect(buyer.body.intro).toContain("住所・氏名・電話番号を出品者へお知らせ");
        expect(buyer.body.intro).toContain("取引画面の「メッセージ」");
        expect(seller.body.intro).toContain("購入者が連絡したお届け先");
        expect(seller.body.intro).toContain("取引画面の「メッセージ」");
      } else {
        expect(buyer.body.intro).not.toContain("住所・氏名・電話番号");
        expect(seller.body.intro).not.toContain("お届け先");
      }
      for (const mail of [seller, buyer]) {
        expect(mail.body.intro).toContain("お支払いが完了");
        expect(mail.body.intro).toContain(method === "in_person" ? "日時・場所" : "発送");
        if (method === "in_person") expect(mail.body.intro).not.toContain("発送");
        expect(mail.body.cta.path).toBe("/transactions/tx-test");
        expect(mail.body.details).toEqual(
          expect.arrayContaining([
            { label: "商品", value: "テスト自転車 <script>" },
            { label: "金額", value: "¥500" },
          ]),
        );
        expect(renderHtml("購入者", mail.body)).not.toContain("<script>");
        expect(renderText("購入者", mail.body)).toContain(mail.body.intro);
      }
    },
  );
  it.each(["shipping", "in_person"])(
    "%s の発送・受け渡し通知は実際の受け取り後の確認を案内する",
    async (method) => {
      mocks.delivery = method;
      await notifyShipped("tx-test");
      const mail = mocks.send.mock.calls[0][0];
      expect(mail.userId).toBe("buyer");
      expect(mail.body.intro).toContain(method === "in_person" ? "受け渡し" : "発送しました");
      expect(mail.body.outro).toContain("実際に商品を受け取り");
      expect(mail.body.outro).toContain("商品の状態を確認してから");
    },
  );
  it("受取通知は出品者へ送り、自動公開の条件も案内する", async () => {
    await notifyReceived("tx-test");
    const mail = mocks.send.mock.calls[0][0];
    expect(mail.userId).toBe("seller");
    expect(mail.body.outro).toContain("その評価の登録から14日経過後");
    expect(mail.body.cta.path).toBe("/transactions/tx-test/review");
  });
  it.each([
    ["buyer", "seller"],
    ["seller", "buyer"],
  ])("%s の評価後は %s だけに依頼する", async (reviewer, recipient) => {
    await notifyReviewRequested("tx-test", reviewer);
    const mail = mocks.send.mock.calls[0][0];
    expect(mail.userId).toBe(recipient);
    expect(mail.body.outro).toContain("その評価の登録から14日経過後");
  });
  it("完了通知は双方に送り、評価済みと断定しない", async () => {
    await notifyCompleted("tx-test");
    expect(mocks.send.mock.calls.map(([mail]) => mail.userId)).toEqual(["buyer", "seller"]);
    expect(mocks.send.mock.calls[0][0].body.intro).not.toContain("評価");
  });
  it("キャンセル通知は返金完了を誤って断定しない", async () => {
    await notifyCanceled("tx-test", "テストのため");
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const mail = mocks.send.mock.calls[0][0];
    expect(mail.body.outro).toContain("運営より個別にご連絡");
    expect(mail.body.outro).not.toContain("返金が完了");
  });
  it("存在しない取引には通知しない", async () => {
    mocks.missing = true;
    await notifyPaid("missing");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("すべての件名にサービス名を明示する", () => {
    for (const meta of Object.values(MAIL_KINDS)) expect(meta.subject).toContain("BicycleMarket");
  });
});
