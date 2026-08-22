import "server-only";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAIL_KINDS, shouldSend, type MailKind } from "@/lib/email/kinds";
import { renderHtml, renderText, type MailBody } from "@/lib/email/template";

let resend: Resend | null = null;

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  // ローカルやテストではキー未設定のことがある。その場合は送信をスキップする。
  if (!apiKey || apiKey === "re_dummy") return null;
  if (!resend) resend = new Resend(apiKey);
  return resend;
}

export type SendMailInput = {
  /** 宛先ユーザー ID(通知設定と状態を参照する) */
  userId: string;
  kind: MailKind;
  body: MailBody;
  /** 抑制判定・ログ用の関連 ID(取引 ID・スレッド ID など) */
  refId?: string;
  /** 件名を上書きしたい場合 */
  subject?: string;
};

/**
 * FR-13 のメール送信ラッパー(ADR #9)。
 *
 * - 通知設定と宛先の状態を確認する
 * - 送信結果を email_logs に記録する
 * - **例外を投げない**。送信失敗が業務処理を止めてはならない。
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  const supabase = createAdminClient();

  try {
    const { data: user } = await supabase
      .from("users")
      .select("email, display_name, status, notification_prefs")
      .eq("id", input.userId)
      .maybeSingle();

    if (!user) return;

    const prefs = (user.notification_prefs ?? {}) as Record<string, unknown>;
    if (!shouldSend(input.kind, prefs, user.status as "active" | "suspended" | "withdrawn")) {
      return;
    }

    const subject = input.subject ?? MAIL_KINDS[input.kind].subject;
    const client = getResend();

    if (!client) {
      // 未設定時は送信せずログのみ残す(ローカル開発)
      console.info(`[mail:skipped] ${input.kind} -> ${user.email} (${subject})`);
      await logMail(input, "sent", "RESEND_API_KEY 未設定のため送信をスキップ");
      return;
    }

    const { error } = await client.emails.send({
      from: process.env.EMAIL_FROM ?? "CycleX <noreply@example.com>",
      to: user.email,
      subject,
      html: renderHtml(user.display_name, input.body),
      text: renderText(user.display_name, input.body),
    });

    if (error) {
      console.error("[mail:failed]", input.kind, error);
      await logMail(input, "failed", error.message);
      return;
    }

    await logMail(input, "sent");
  } catch (error) {
    // ここで throw すると呼び出し元の業務処理が巻き添えになる
    console.error("[mail:error]", input.kind, error);
    await logMail(input, "failed", error instanceof Error ? error.message : String(error)).catch(
      () => undefined,
    );
  }
}

async function logMail(
  input: SendMailInput,
  status: "sent" | "failed",
  error?: string,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("email_logs").insert({
    user_id: input.userId,
    kind: input.kind,
    ref_id: input.refId ?? null,
    status,
    error: error ?? null,
  });
}

/** 同一の宛先・種別・対象で、直近に送信済みかを調べる(連続通知の抑制に使う) */
export async function findLastSentAt(
  userId: string,
  kind: MailKind,
  refId: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("email_logs")
    .select("created_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("ref_id", refId)
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.created_at ?? null;
}
