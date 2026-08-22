import { absoluteUrl } from "@/lib/utils";

/**
 * メール本文のテンプレート。
 * 外部の React Email 等を足さず、共通レイアウトの文字列組み立てで済ませる。
 */

export type MailBody = {
  /** 宛名の直後に置く導入文 */
  intro: string;
  /** 箇条書きにする詳細(任意) */
  details?: { label: string; value: string }[];
  /** 行動導線 */
  cta?: { label: string; path: string };
  /** 末尾の補足(任意) */
  outro?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML 版 */
export function renderHtml(recipientName: string, body: MailBody): string {
  const detailRows = (body.details ?? [])
    .map(
      (detail) => `
        <tr>
          <td style="padding:4px 12px 4px 0;color:#5C6663;font-size:13px;">${escapeHtml(detail.label)}</td>
          <td style="padding:4px 0;font-size:13px;">${escapeHtml(detail.value)}</td>
        </tr>`,
    )
    .join("");

  const cta = body.cta
    ? `<p style="margin:24px 0;">
         <a href="${absoluteUrl(body.cta.path)}"
            style="display:inline-block;background:#0E7C6B;color:#ffffff;text-decoration:none;
                   padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
           ${escapeHtml(body.cta.label)}
         </a>
       </p>`
    : "";

  return `<!doctype html>
<html lang="ja">
<body style="margin:0;padding:24px;background:#F7FAF9;font-family:system-ui,-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;color:#1E2422;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
    <p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#0E7C6B;">CycleX</p>
    <p style="margin:0 0 16px;font-size:14px;">${escapeHtml(recipientName)} 様</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.8;">${escapeHtml(body.intro)}</p>
    ${detailRows ? `<table style="margin:16px 0;border-collapse:collapse;">${detailRows}</table>` : ""}
    ${cta}
    ${body.outro ? `<p style="margin:16px 0 0;font-size:13px;color:#5C6663;line-height:1.8;">${escapeHtml(body.outro)}</p>` : ""}
    <hr style="margin:24px 0 16px;border:none;border-top:1px solid #DFE8E4;">
    <p style="margin:0;font-size:11px;color:#5C6663;line-height:1.7;">
      このメールは CycleX から自動送信されています。<br>
      通知の設定は<a href="${absoluteUrl("/mypage/settings")}" style="color:#0E7C6B;">設定画面</a>から変更できます。
    </p>
  </div>
</body>
</html>`;
}

/** テキスト版(HTML を表示しない環境向け) */
export function renderText(recipientName: string, body: MailBody): string {
  const lines = [`${recipientName} 様`, "", body.intro];

  if (body.details?.length) {
    lines.push("");
    for (const detail of body.details) {
      lines.push(`${detail.label}: ${detail.value}`);
    }
  }
  if (body.cta) {
    lines.push("", `${body.cta.label}: ${absoluteUrl(body.cta.path)}`);
  }
  if (body.outro) {
    lines.push("", body.outro);
  }

  lines.push(
    "",
    "----",
    "このメールは CycleX から自動送信されています。",
    `通知の設定: ${absoluteUrl("/mypage/settings")}`,
  );

  return lines.join("\n");
}
