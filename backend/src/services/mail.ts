import { config } from "../config.js";

export type Mail = { to: string; subject: string; text: string; html: string };

/** Sends through Resend when RESEND_API_KEY is set; otherwise prints the mail to the server log (local use). */
export async function sendMail(mail: Mail) {
  if (!config.resendKey) {
    console.log(`[mail] RESEND_API_KEY not set — not sent. To: ${mail.to}\nSubject: ${mail.subject}\n${mail.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.mailFrom, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
}
