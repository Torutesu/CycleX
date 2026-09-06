/**
 * ローカル Supabase のメールキャッチャー(Mailpit / 54324)を読むための道具。
 * ホストされた環境では動かないので、呼ぶ側で available() を見て skip する。
 */

const MAIL_API = "http://127.0.0.1:54324/api/v1";

export type MailSummary = { ID: string; Subject: string; To: { Address: string }[] };

export async function mailcatcherAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${MAIL_API}/messages?limit=1`);
    return response.ok;
  } catch {
    return false;
  }
}

/** 宛先に届いたメールのうち、既読済み ID を除いた最新の1通を待つ */
export async function waitForMail(to: string, seen: Set<string>): Promise<MailSummary> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(`${MAIL_API}/messages?limit=50`);
    const { messages } = (await response.json()) as { messages: MailSummary[] };
    const hit = messages.find(
      (m) => !seen.has(m.ID) && m.To.some((address) => address.Address === to),
    );
    if (hit) {
      seen.add(hit.ID);
      return hit;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`メールが届きません: ${to}`);
}

/** メール本文から認証リンクを取り出す */
export async function linkInMail(id: string): Promise<string> {
  const response = await fetch(`${MAIL_API}/message/${id}`);
  const body = (await response.json()) as { HTML?: string; Text?: string };
  const urls = (body.HTML || body.Text || "").match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const link = urls.find((url) => url.includes("/verify") || url.includes("/auth/callback"));
  if (!link) throw new Error("メール本文に認証リンクがありません");
  return link.replace(/&amp;/g, "&");
}
