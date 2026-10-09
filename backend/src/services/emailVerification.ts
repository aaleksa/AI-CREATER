import { createHash, randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import { config, FREE_CREDITS } from "../config.js";
import { grantCredits } from "./credits.js";
import { sendMail } from "./mail.js";

export const FREE_CREDITS_NOTE = "Free plan credits";
/** A link works for two days; a new one replaces the old. */
const LINK_TTL_MS = 48 * 60 * 60 * 1000;
const RESEND_GAP_MS = 60 * 1000;

type Lang = "en" | "uk";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Asking for a confirmed address only makes sense when letters reach everyone. Resend's test sender
 * (onboarding@resend.dev) delivers only to the Resend account owner, so it does not count as set up.
 */
export function verificationRequired() {
  if (config.emailVerification === "on") return true;
  if (config.emailVerification === "off") return false;
  return Boolean(config.resendKey) && !/@resend\.dev>?\s*$/i.test(config.mailFrom);
}

export function isEmailVerified(userId: string) {
  const row = db.prepare("SELECT email_verified_at FROM users WHERE id = ?").get(userId) as
    | { email_verified_at: string | null }
    | undefined;
  return Boolean(row?.email_verified_at);
}

/** True when this owner must confirm before generating. */
export function needsVerification(userId: string) {
  return verificationRequired() && !isEmailVerified(userId);
}

export function emailUnverifiedError() {
  return Object.assign(
    new Error("Confirm your email first — we sent you a link. Your 400 free credits arrive right after."),
    { status: 403, code: "email_unverified" }
  );
}

function letter(lang: Lang, name: string, link: string) {
  if (lang === "uk") {
    return {
      subject: "Підтвердіть пошту — і отримайте 400 кредитів",
      text: `Вітаємо, ${name}!\n\nНатисніть посилання, щоб підтвердити пошту й отримати 400 безкоштовних кредитів:\n${link}\n\nПосилання діє 2 дні. Якщо ви не реєструвалися в Auteur, просто проігноруйте цей лист.`,
      html: `<p>Вітаємо, ${escapeHtml(name)}!</p><p>Натисніть кнопку, щоб підтвердити пошту й отримати 400 безкоштовних кредитів.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#c45c26;color:#fff;border-radius:999px;text-decoration:none">Підтвердити пошту</a></p><p style="color:#777;font-size:13px">Посилання діє 2 дні. Якщо ви не реєструвалися в Auteur, просто проігноруйте цей лист.</p>`,
    };
  }
  return {
    subject: "Confirm your email — and get 400 credits",
    text: `Hi ${name},\n\nOpen this link to confirm your email and get 400 free credits:\n${link}\n\nThe link works for 2 days. If you didn’t sign up for Auteur, just ignore this email.`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Confirm your email to get 400 free credits.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#c45c26;color:#fff;border-radius:999px;text-decoration:none">Confirm email</a></p><p style="color:#777;font-size:13px">The link works for 2 days. If you didn’t sign up for Auteur, just ignore this email.</p>`,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** New link for this address. A mail failure is logged, never shown — the owner can press "Send again". */
export async function sendVerificationLink(userId: string, lang: Lang) {
  const row = db.prepare("SELECT email, name FROM users WHERE id = ?").get(userId) as
    | { email: string; name: string }
    | undefined;
  if (!row) return;
  const token = randomBytes(32).toString("base64url");
  db.prepare("UPDATE users SET verify_token_hash = ?, verify_sent_at = ? WHERE id = ?").run(
    hash(token),
    new Date().toISOString(),
    userId
  );
  const link = `${config.appUrl.replace(/\/$/, "")}/verify-email?token=${token}`;
  try {
    await sendMail({ to: row.email, ...letter(lang, row.name, link) });
  } catch (error) {
    console.error("Verification email failed", userId, error);
  }
}

export async function resendVerificationLink(userId: string, lang: Lang) {
  const row = db.prepare("SELECT email_verified_at, verify_sent_at FROM users WHERE id = ?").get(userId) as
    | { email_verified_at: string | null; verify_sent_at: string | null }
    | undefined;
  if (!row || row.email_verified_at || !verificationRequired()) return { verified: true };
  const last = row.verify_sent_at ? Date.parse(row.verify_sent_at) : 0;
  if (Date.now() - last < RESEND_GAP_MS) {
    throw Object.assign(new Error("We just sent a link. Check your inbox and spam, or try again in a minute."), {
      status: 429,
    });
  }
  await sendVerificationLink(userId, lang);
  return { verified: false };
}

/** Marks the address confirmed and gives the Free credits once per account. */
export function confirmEmail(token: string) {
  const row = token
    ? (db.prepare("SELECT id, verify_sent_at FROM users WHERE verify_token_hash = ?").get(hash(token)) as
        | { id: string; verify_sent_at: string | null }
        | undefined)
    : undefined;
  if (!row) {
    throw Object.assign(new Error("This link no longer works. If your email is already confirmed, just sign in."), {
      status: 400,
    });
  }
  if (!row.verify_sent_at || Date.now() - Date.parse(row.verify_sent_at) > LINK_TTL_MS) {
    throw Object.assign(new Error("This link has expired. Sign in and press “Send again”."), { status: 400 });
  }
  db.transaction(() => {
    db.prepare(
      "UPDATE users SET email_verified_at = datetime('now'), verify_token_hash = NULL WHERE id = ?"
    ).run(row.id);
    const granted = db
      .prepare("SELECT 1 FROM credit_transactions WHERE user_id = ? AND type = 'grant' AND description = ?")
      .get(row.id, FREE_CREDITS_NOTE);
    if (!granted) grantCredits(row.id, FREE_CREDITS, "grant", FREE_CREDITS_NOTE);
  })();
  return row.id;
}

export function langOf(header: string | undefined): Lang {
  return /^uk\b/i.test(String(header || "")) ? "uk" : "en";
}
