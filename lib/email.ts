import "server-only";
import { Resend } from "resend";

let client: Resend | undefined;

export function emailReady(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Where LiftPage's own notices go: new requests, paid deposits. */
export function notifyAddress(): string | undefined {
  return process.env.LIFTPAGE_NOTIFY_EMAIL || process.env.LIFTPAGE_ADMIN_EMAIL || undefined;
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Plain paragraphs, one optional button. Every value is escaped. */
function html(lines: string[], action?: { label: string; url: string }): string {
  const body = lines.map((line) => `<p style="margin:0 0 14px">${escape(line).replace(/\n/g, "<br>")}</p>`).join("");
  const button = action
    ? `<p style="margin:22px 0"><a href="${escape(action.url)}" style="background:#f2d14b;color:#0d0d0d;padding:10px 16px;text-decoration:none;font-family:monospace;text-transform:uppercase;letter-spacing:.12em;font-size:12px">${escape(action.label)}</a></p><p style="margin:0 0 14px;color:#666;font-size:12px">Or paste this link: ${escape(action.url)}</p>`
    : "";
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:520px">${body}${button}<p style="margin-top:28px;color:#888;font-size:12px">LiftPage · Attention into traction</p></div>`;
}

export type Mail = {
  to: string;
  subject: string;
  lines: string[];
  action?: { label: string; url: string };
  replyTo?: string;
  /** Resend drops a repeat send with the same key, so a retried job can't double-mail. */
  idempotencyKey?: string;
};

/** Sends through Resend. Returns false, without throwing, when email isn't configured. */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!emailReady()) return false;
  client ??= new Resend(process.env.RESEND_API_KEY);
  const text = [...mail.lines, ...(mail.action ? [`${mail.action.label}: ${mail.action.url}`] : []), "", "LiftPage"].join("\n\n");
  const { error } = await client.emails.send(
    {
      from: process.env.EMAIL_FROM!,
      to: mail.to,
      subject: mail.subject,
      text,
      html: html(mail.lines, mail.action),
      replyTo: mail.replyTo ?? notifyAddress(),
    },
    mail.idempotencyKey ? { idempotencyKey: mail.idempotencyKey } : undefined,
  );
  if (error) throw new Error(`Resend: ${error.message}`);
  return true;
}
