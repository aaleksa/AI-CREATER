import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { config, FREE_CREDITS } from "../config.js";
import { grantCredits } from "./credits.js";
import { sendMail } from "./mail.js";

export const FREE_CREDITS_NOTE = "Free plan credits";
/** A link (and its code) works for two days; a new one replaces the old. */
const LINK_TTL_MS = 48 * 60 * 60 * 1000;
const RESEND_GAP_MS = 60 * 1000;
/** Wrong codes allowed before the code stops working and a new letter is needed. */
const CODE_TRIES = 5;
/** A password reset link works for an hour, once. */
const RESET_TTL_MS = 60 * 60 * 1000;

type Lang = "en" | "uk";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

function sameHash(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const BUTTON = "display:inline-block;padding:12px 20px;background:#c45c26;color:#fff;border-radius:999px;text-decoration:none";
const CODE = "font-size:28px;letter-spacing:6px;font-weight:700;font-family:monospace";
const SMALL = "color:#777;font-size:13px";

function verifyLetter(lang: Lang, name: string, link: string, code: string) {
  if (lang === "uk") {
    return {
      subject: `Код ${code} — підтвердіть пошту й отримайте 400 кредитів`,
      text: `Вітаємо, ${name}!\n\nВаш код: ${code}\nВведіть його в студії або відкрийте посилання, щоб підтвердити пошту й отримати 400 безкоштовних кредитів:\n${link}\n\nКод і посилання діють 2 дні. Якщо ви не реєструвалися в Auteur, просто проігноруйте цей лист.`,
      html: `<p>Вітаємо, ${escapeHtml(name)}!</p><p>Ваш код:</p><p style="${CODE}">${code}</p><p>Введіть його в студії — або натисніть кнопку, щоб підтвердити пошту й отримати 400 безкоштовних кредитів.</p><p><a href="${link}" style="${BUTTON}">Підтвердити пошту</a></p><p style="${SMALL}">Код і посилання діють 2 дні. Якщо ви не реєструвалися в Auteur, просто проігноруйте цей лист.</p>`,
    };
  }
  return {
    subject: `Code ${code} — confirm your email and get 400 credits`,
    text: `Hi ${name},\n\nYour code: ${code}\nEnter it in the studio, or open this link to confirm your email and get 400 free credits:\n${link}\n\nThe code and link work for 2 days. If you didn’t sign up for Auteur, just ignore this email.`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Your code:</p><p style="${CODE}">${code}</p><p>Enter it in the studio — or press the button to confirm your email and get 400 free credits.</p><p><a href="${link}" style="${BUTTON}">Confirm email</a></p><p style="${SMALL}">The code and link work for 2 days. If you didn’t sign up for Auteur, just ignore this email.</p>`,
  };
}

function resetLetter(lang: Lang, name: string, link: string) {
  if (lang === "uk") {
    return {
      subject: "Новий пароль для Auteur",
      text: `Вітаємо, ${name}!\n\nЩоб задати новий пароль, відкрийте посилання:\n${link}\n\nПосилання діє 1 годину і спрацює один раз. Після зміни пароля ми вийдемо з акаунта на всіх пристроях. Якщо ви не просили новий пароль, просто проігноруйте цей лист — старий пароль лишиться.`,
      html: `<p>Вітаємо, ${escapeHtml(name)}!</p><p>Щоб задати новий пароль, натисніть кнопку.</p><p><a href="${link}" style="${BUTTON}">Задати новий пароль</a></p><p style="${SMALL}">Посилання діє 1 годину і спрацює один раз. Після зміни пароля ми вийдемо з акаунта на всіх пристроях. Якщо ви не просили новий пароль, просто проігноруйте цей лист — старий пароль лишиться.</p>`,
    };
  }
  return {
    subject: "A new password for Auteur",
    text: `Hi ${name},\n\nTo set a new password, open this link:\n${link}\n\nThe link works for 1 hour, once. After the change you are signed out on every device. If you didn’t ask for a new password, just ignore this email — your password stays the same.`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>To set a new password, press the button.</p><p><a href="${link}" style="${BUTTON}">Set a new password</a></p><p style="${SMALL}">The link works for 1 hour, once. After the change you are signed out on every device. If you didn’t ask for a new password, just ignore this email — your password stays the same.</p>`,
  };
}

function emailChangedLetter(lang: Lang, name: string, newEmail: string) {
  if (lang === "uk") {
    return {
      subject: "Пошту в Auteur змінено",
      text: `Вітаємо, ${name}!\n\nПошту вашого акаунта Auteur змінено на ${newEmail}. Листи тепер ітимуть туди.\n\nЯкщо це були не ви — напишіть нам у відповідь на цей лист.`,
      html: `<p>Вітаємо, ${escapeHtml(name)}!</p><p>Пошту вашого акаунта Auteur змінено на <b>${escapeHtml(newEmail)}</b>. Листи тепер ітимуть туди.</p><p style="${SMALL}">Якщо це були не ви — напишіть нам у відповідь на цей лист.</p>`,
    };
  }
  return {
    subject: "Your Auteur email was changed",
    text: `Hi ${name},\n\nThe email of your Auteur account was changed to ${newEmail}. Letters go there from now on.\n\nIf this wasn’t you, reply to this email.`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>The email of your Auteur account was changed to <b>${escapeHtml(newEmail)}</b>. Letters go there from now on.</p><p style="${SMALL}">If this wasn’t you, reply to this email.</p>`,
  };
}

/** New link and code for this address. Returns false when the letter could not be sent. */
export async function sendVerificationLink(userId: string, lang: Lang) {
  const row = db.prepare("SELECT email, name FROM users WHERE id = ?").get(userId) as
    | { email: string; name: string }
    | undefined;
  if (!row) return false;
  const token = randomBytes(32).toString("base64url");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  db.prepare(
    "UPDATE users SET verify_token_hash = ?, verify_code_hash = ?, verify_code_tries = 0, verify_sent_at = ? WHERE id = ?"
  ).run(hash(token), hash(code), new Date().toISOString(), userId);
  const link = `${config.appUrl.replace(/\/$/, "")}/verify-email?token=${token}`;
  try {
    await sendMail({ to: row.email, ...verifyLetter(lang, row.name, link, code) });
    return true;
  } catch (error) {
    console.error("Verification email failed", userId, error);
    return false;
  }
}

const MAIL_FAILED = "We couldn’t send the email right now. Check the address on the Account page, or try again in a few minutes.";

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
  if (!(await sendVerificationLink(userId, lang))) throw Object.assign(new Error(MAIL_FAILED), { status: 502 });
  return { verified: false };
}

/** The address is confirmed: mark it and give the Free credits once per account. */
function markVerified(userId: string) {
  db.transaction(() => {
    db.prepare(
      "UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime('now')), verify_token_hash = NULL, verify_code_hash = NULL, verify_code_tries = 0 WHERE id = ?"
    ).run(userId);
    const granted = db
      .prepare("SELECT 1 FROM credit_transactions WHERE user_id = ? AND type = 'grant' AND description = ?")
      .get(userId, FREE_CREDITS_NOTE);
    if (!granted) grantCredits(userId, FREE_CREDITS, "grant", FREE_CREDITS_NOTE);
  })();
}

/** Confirms the address from the link in the letter. */
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
  markVerified(row.id);
  return row.id;
}

/** Confirms the address from the 6-digit code in the letter, typed in the studio. */
export function confirmEmailCode(userId: string, rawCode: unknown) {
  const code = String(rawCode ?? "").replace(/\D/g, "");
  const row = db
    .prepare("SELECT email_verified_at, verify_code_hash, verify_code_tries, verify_sent_at FROM users WHERE id = ?")
    .get(userId) as
    | { email_verified_at: string | null; verify_code_hash: string | null; verify_code_tries: number; verify_sent_at: string | null }
    | undefined;
  if (!row) throw Object.assign(new Error("Session expired. Please sign in again."), { status: 401 });
  if (row.email_verified_at) return { verified: true };
  if (!row.verify_code_hash || Number(row.verify_code_tries) >= CODE_TRIES) {
    throw Object.assign(new Error("This code no longer works. Press “Send again” for a new one."), { status: 400 });
  }
  if (!row.verify_sent_at || Date.now() - Date.parse(row.verify_sent_at) > LINK_TTL_MS) {
    throw Object.assign(new Error("This code has expired. Press “Send again” for a new one."), { status: 400 });
  }
  if (code.length !== 6 || !sameHash(hash(code), row.verify_code_hash)) {
    db.prepare("UPDATE users SET verify_code_tries = verify_code_tries + 1 WHERE id = ?").run(userId);
    const left = CODE_TRIES - Number(row.verify_code_tries) - 1;
    throw Object.assign(
      new Error(left > 0 ? "That code is not right. Check the latest email and try again." : "This code no longer works. Press “Send again” for a new one."),
      { status: 400 }
    );
  }
  markVerified(userId);
  return { verified: true };
}

/** "Forgot password": a one-time link to the address, if there is such an account. Never says whether there is. */
export async function sendPasswordReset(rawEmail: unknown, lang: Lang) {
  const email = String(rawEmail ?? "").toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("Enter a valid email address."), { status: 400 });
  }
  const row = db.prepare("SELECT id, name, reset_sent_at FROM users WHERE email = ?").get(email) as
    | { id: string; name: string; reset_sent_at: string | null }
    | undefined;
  if (!row) return;
  // One letter a minute per account, so the button can't be used to flood someone's inbox.
  if (row.reset_sent_at && Date.now() - Date.parse(row.reset_sent_at) < RESEND_GAP_MS) return;
  const token = randomBytes(32).toString("base64url");
  db.prepare("UPDATE users SET reset_token_hash = ?, reset_sent_at = ? WHERE id = ?").run(hash(token), new Date().toISOString(), row.id);
  const link = `${config.appUrl.replace(/\/$/, "")}/reset-password?token=${token}`;
  try {
    await sendMail({ to: email, ...resetLetter(lang, row.name, link) });
  } catch (error) {
    console.error("Password reset email failed", row.id, error);
    throw Object.assign(new Error(MAIL_FAILED), { status: 502 });
  }
}

/** Sets the new password from the reset link; signs out every device. The address is proven, so it counts as confirmed. */
export function resetPassword(token: unknown, rawPassword: unknown) {
  const password = String(rawPassword ?? "");
  if (password.length < 6) throw Object.assign(new Error("Password must be at least 6 characters."), { status: 400 });
  const row = token
    ? (db.prepare("SELECT id, email, name, token_version, reset_sent_at FROM users WHERE reset_token_hash = ?").get(hash(String(token))) as
        | { id: string; email: string; name: string; token_version: number; reset_sent_at: string | null }
        | undefined)
    : undefined;
  if (!row || !row.reset_sent_at || Date.now() - Date.parse(row.reset_sent_at) > RESET_TTL_MS) {
    throw Object.assign(new Error("This link no longer works. Ask for a new one on the sign-in page."), { status: 400 });
  }
  const version = Number(row.token_version || 0) + 1;
  db.prepare("UPDATE users SET password_hash = ?, token_version = ?, reset_token_hash = NULL, reset_sent_at = NULL WHERE id = ?").run(
    bcrypt.hashSync(password, 10),
    version,
    row.id
  );
  if (verificationRequired()) markVerified(row.id);
  return { user: { id: row.id, email: row.email, name: row.name }, version };
}

/** The old address hears that the account's email changed — the one warning that reaches the real owner. */
export async function notifyEmailChanged(oldEmail: string, name: string, newEmail: string, lang: Lang) {
  try {
    await sendMail({ to: oldEmail, ...emailChangedLetter(lang, name, newEmail) });
  } catch (error) {
    console.error("Email-changed notice failed", error);
  }
}

export function langOf(header: string | undefined): Lang {
  return /^uk\b/i.test(String(header || "")) ? "uk" : "en";
}
