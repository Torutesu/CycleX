import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * 送信そのものは Resend の鍵が無いと試せないため、Resend を差し替えて
 * 「どんな引数で呼ぶか」「失敗をどう扱うか」を確かめる。
 *
 * ここで見たいのは、業務処理がメールの失敗に巻き込まれないこと。
 * 送信は必ず記録に残り、例外は外へ出ない。
 */

type UserRow = {
  email: string;
  display_name: string;
  status: string;
  notification_prefs: Record<string, unknown> | null;
};

const sendSpy = vi.fn();
const insertSpy = vi.fn();
let userRow: UserRow | null = null;

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendSpy };
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === "email_logs") {
        return {
          insert: (row: unknown) => {
            insertSpy(row);
            return Promise.resolve({});
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: userRow }) }),
        }),
      };
    },
  }),
}));

const BODY = { intro: "取引が成立しました。" };

async function sendMail(input: Parameters<typeof import("@/lib/email/send").sendMail>[0]) {
  const mailer = await import("@/lib/email/send");
  return mailer.sendMail(input);
}

describe("メールの送信", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    sendSpy.mockReset().mockResolvedValue({ error: null });
    insertSpy.mockReset();
    userRow = {
      email: "buyer@example.com",
      display_name: "さとう",
      status: "active",
      notification_prefs: null,
    };
    process.env = {
      ...original,
      RESEND_API_KEY: "re_live_dummy",
      EMAIL_FROM: "CycleX <no-reply@cyclex.jp>",
    };
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...original };
    vi.restoreAllMocks();
  });

  it("宛先・送信元・件名・本文をそろえて送る", async () => {
    await sendMail({ userId: "u1", kind: "purchase_confirmed", body: BODY, refId: "tx1" });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sent = sendSpy.mock.calls[0][0];
    expect(sent.to).toBe("buyer@example.com");
    expect(sent.from).toBe("CycleX <no-reply@cyclex.jp>");
    expect(sent.subject).toBe("ご購入ありがとうございます");
    expect(sent.html).toContain("さとう 様");
    expect(sent.html).toContain("取引が成立しました。");
    // HTML を見ない環境向けの本文も必ず添える
    expect(sent.text).toContain("さとう 様");
    expect(sent.text).toContain("取引が成立しました。");

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        kind: "purchase_confirmed",
        ref_id: "tx1",
        status: "sent",
      }),
    );
  });

  it("件名は必要なら差し替えられる", async () => {
    await sendMail({
      userId: "u1",
      kind: "new_message",
      body: BODY,
      subject: "やまだ さんからメッセージ",
    });
    expect(sendSpy.mock.calls[0][0].subject).toBe("やまだ さんからメッセージ");
  });

  it("送信元が空のまま登録されていても、既定の送信元で送る", async () => {
    process.env.EMAIL_FROM = "   ";
    await sendMail({ userId: "u1", kind: "purchase_confirmed", body: BODY });
    expect(sendSpy.mock.calls[0][0].from).toBe("CycleX <noreply@example.com>");
  });

  it("鍵が無い環境では送らず、記録だけ残す", async () => {
    delete process.env.RESEND_API_KEY;
    await sendMail({ userId: "u1", kind: "purchase_confirmed", body: BODY });

    expect(sendSpy).not.toHaveBeenCalled();
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent", error: expect.stringContaining("未設定") }),
    );
  });

  it("通知を切っている種別は送らない", async () => {
    userRow!.notification_prefs = { message: false };
    await sendMail({ userId: "u1", kind: "new_message", body: BODY });
    expect(sendSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("設定に関わらず送る種別は、切っていても送る", async () => {
    userRow!.notification_prefs = { transaction: false, message: false, review: false };
    await sendMail({ userId: "u1", kind: "tx_canceled", body: BODY });
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it("退会・停止した宛先には送らない", async () => {
    for (const status of ["withdrawn", "suspended"]) {
      sendSpy.mockClear();
      userRow!.status = status;
      await sendMail({ userId: "u1", kind: "purchase_confirmed", body: BODY });
      expect(sendSpy, status).not.toHaveBeenCalled();
    }
  });

  it("宛先が見つからないときは何もしない", async () => {
    userRow = null;
    await sendMail({ userId: "missing", kind: "purchase_confirmed", body: BODY });
    expect(sendSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("送信が失敗しても例外にせず、失敗として記録する", async () => {
    sendSpy.mockResolvedValue({ error: { message: "Domain is not verified" } });

    await expect(
      sendMail({ userId: "u1", kind: "purchase_confirmed", body: BODY, refId: "tx9" }),
    ).resolves.toBeUndefined();

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "Domain is not verified", ref_id: "tx9" }),
    );
  });

  it("送信そのものが例外になっても、呼び出し元を巻き込まない", async () => {
    sendSpy.mockRejectedValue(new Error("connect ETIMEDOUT"));

    await expect(
      sendMail({ userId: "u1", kind: "purchase_confirmed", body: BODY }),
    ).resolves.toBeUndefined();

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: expect.stringContaining("ETIMEDOUT") }),
    );
  });
});
