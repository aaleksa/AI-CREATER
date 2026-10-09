import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { FREE_CREDITS } from "../config.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { ensureCreditAccount, grantCredits } from "../services/credits.js";
import { deleteAccount } from "../services/account.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { isAdminUser } from "./admin.js";
import {
  confirmEmail,
  FREE_CREDITS_NOTE,
  langOf,
  needsVerification,
  resendVerificationLink,
  sendVerificationLink,
  verificationRequired,
} from "../services/emailVerification.js";

export const authRouter = Router();

function ensureBrandKit(userId: string, name: string) {
  const existing = db.prepare("SELECT id FROM brand_kits WHERE user_id = ?").get(userId);
  if (!existing) {
    db.prepare(`INSERT INTO brand_kits (id, user_id, business_name) VALUES (?, ?, ?)`).run(uuid(), userId, name);
  }
}

authRouter.post("/signup", rateLimit(5, 60 * 60_000, "Too many attempts. Wait a few minutes, then try again.", "signup"), async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (!email || !password || !name) {
    res.status(400).json({ error: "Name, email and password are required." });
    return;
  }
  if (String(password).length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }
  const normalised = String(email).toLowerCase().trim();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalised);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }
  try {
    const id = uuid();
    const mustConfirm = verificationRequired();
    db.transaction(() => {
      db.prepare("INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)").run(
        id,
        normalised,
        bcrypt.hashSync(String(password), 10),
        String(name)
      );
      db.prepare("INSERT INTO subscriptions (id, user_id, plan_id, status) VALUES (?, ?, 'free', 'active')").run(uuid(), id);
      // Credits wait for the confirmed address only while letters can actually reach people.
      if (mustConfirm) db.prepare("INSERT INTO credit_balances (user_id, credits) VALUES (?, 0)").run(id);
      else grantCredits(id, FREE_CREDITS, "grant", FREE_CREDITS_NOTE);
      db.prepare(`INSERT INTO brand_kits (id, user_id, business_name) VALUES (?, ?, ?)`).run(uuid(), id, String(name));
    })();
    if (mustConfirm) await sendVerificationLink(id, langOf(req.get("Accept-Language")));
    const user = { id, email: normalised, name: String(name) };
    res.json({ token: signToken(user, 0), user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not create the account." });
  }
});

authRouter.post("/login", (req, res) => {
  const { email, password } = req.body ?? {};
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email || "").toLowerCase().trim()) as
    | { id: string; email: string; name: string; password_hash: string; token_version: number }
    | undefined;
  if (!row || !bcrypt.compareSync(String(password || ""), row.password_hash)) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  if (!needsVerification(row.id)) ensureCreditAccount(row.id, FREE_CREDITS, FREE_CREDITS_NOTE);
  ensureBrandKit(row.id, row.name);
  const user = { id: row.id, email: row.email, name: row.name };
  res.json({ token: signToken(user, Number(row.token_version || 0)), user });
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, email, name, created_at FROM users WHERE id = ?").get(req.user!.id) as
    | { id: string; email: string; name: string; created_at: string }
    | undefined;
  if (!user) {
    res.status(401).json({ error: "Session expired. Please sign in again." });
    return;
  }
  const emailVerified = !needsVerification(user.id);
  if (emailVerified) ensureCreditAccount(user.id, FREE_CREDITS, FREE_CREDITS_NOTE);
  ensureBrandKit(user.id, user.name);
  const sub = db.prepare(
    `SELECT s.status, p.id as plan_id, p.name as plan_name, p.monthly_credits
     FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.user_id = ? AND s.status = 'active'
     ORDER BY s.created_at DESC LIMIT 1`
  ).get(req.user!.id);
  const credits = db.prepare("SELECT credits FROM credit_balances WHERE user_id = ?").get(req.user!.id) as
    | { credits: number }
    | undefined;
  res.json({
    user,
    subscription: sub ?? null,
    credits: Number(credits?.credits ?? 0),
    isAdmin: isAdminUser(user.id),
    emailVerified,
  });
});

authRouter.post("/verify-email", rateLimit(20, 15 * 60_000, "Too many attempts. Wait a few minutes, then try again.", "verify"), (req, res) => {
  try {
    confirmEmail(String(req.body?.token || ""));
    res.json({ ok: true });
  } catch (error) {
    const err = error as Error & { status?: number };
    res.status(err.status || 500).json({ error: err.status ? err.message : "Something went wrong. Try again in a minute." });
  }
});

authRouter.post(
  "/verify-email/resend",
  requireAuth,
  rateLimit(5, 60 * 60_000, "Too many attempts. Wait a few minutes, then try again.", "verify-resend"),
  async (req, res) => {
    try {
      res.json(await resendVerificationLink(req.user!.id, langOf(req.get("Accept-Language"))));
    } catch (error) {
      const err = error as Error & { status?: number };
      res.status(err.status || 500).json({ error: err.status ? err.message : "Something went wrong. Try again in a minute." });
    }
  }
);

const sensitive = rateLimit(10, 15 * 60_000, "Too many attempts. Wait a few minutes, then try again.", "account");

type UserRow = { id: string; email: string; name: string; password_hash: string; token_version: number };

function userRow(id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

function passwordOk(row: UserRow, password: unknown) {
  return bcrypt.compareSync(String(password || ""), row.password_hash);
}

authRouter.patch("/profile", requireAuth, sensitive, async (req, res) => {
  const row = userRow(req.user!.id);
  if (!row) {
    res.status(401).json({ error: "Session expired. Please sign in again." });
    return;
  }
  const body = req.body ?? {};
  const name = body.name === undefined ? row.name : String(body.name).trim();
  const email = body.email === undefined ? row.email : String(body.email).toLowerCase().trim();
  if (!name || name.length > 80) {
    res.status(400).json({ error: "Enter a name (up to 80 characters)." });
    return;
  }
  if (email !== row.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }
    if (!passwordOk(row, body.currentPassword)) {
      res.status(403).json({ error: "Current password is incorrect." });
      return;
    }
    const taken = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, row.id);
    if (taken) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }
  }
  db.prepare("UPDATE users SET name = ?, email = ? WHERE id = ?").run(name, email, row.id);
  if (email !== row.email) {
    // A new address must be confirmed again; credits already given are not given twice.
    db.prepare("UPDATE users SET email_verified_at = NULL WHERE id = ?").run(row.id);
    if (verificationRequired()) await sendVerificationLink(row.id, langOf(req.get("Accept-Language")));
  }
  const user = { id: row.id, email, name };
  res.json({ token: signToken(user, Number(row.token_version || 0)), user });
});

authRouter.post("/password", requireAuth, sensitive, (req, res) => {
  const row = userRow(req.user!.id);
  if (!row) {
    res.status(401).json({ error: "Session expired. Please sign in again." });
    return;
  }
  const { currentPassword, newPassword } = req.body ?? {};
  if (!passwordOk(row, currentPassword)) {
    res.status(403).json({ error: "Current password is incorrect." });
    return;
  }
  if (String(newPassword || "").length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }
  if (String(newPassword) === String(currentPassword)) {
    res.status(400).json({ error: "Choose a new password that is different from the current one." });
    return;
  }
  const version = Number(row.token_version || 0) + 1;
  db.prepare("UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?").run(
    bcrypt.hashSync(String(newPassword), 10),
    version,
    row.id
  );
  // Every other device is signed out; this one gets a fresh token.
  res.json({ token: signToken({ id: row.id, email: row.email, name: row.name }, version) });
});

authRouter.post("/logout-all", requireAuth, (req, res) => {
  db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").run(req.user!.id);
  res.json({ ok: true });
});

const PRIVATE_PROJECT_KEYS = new Set(["preview_token", "preview_expires_at", "user_id"]);

authRouter.get("/export", requireAuth, sensitive, (req, res) => {
  const id = req.user!.id;
  const user = db.prepare("SELECT id, email, name, created_at FROM users WHERE id = ?").get(id);
  if (!user) {
    res.status(401).json({ error: "Session expired. Please sign in again." });
    return;
  }
  const parse = (value: unknown) => {
    if (typeof value !== "string" || !value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };
  const projects = (db.prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY created_at").all(id) as Record<string, unknown>[]).map(
    (row) => {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (PRIVATE_PROJECT_KEYS.has(key)) continue;
        if (key.endsWith("_json")) out[key.slice(0, -5)] = parse(value);
        else out[key] = value;
      }
      return out;
    }
  );
  const brand = db.prepare("SELECT * FROM brand_kits WHERE user_id = ?").get(id) as Record<string, unknown> | undefined;
  if (brand) {
    delete brand.user_id;
    brand.learned_summary = parse(brand.learned_summary_json);
    delete brand.learned_summary_json;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    note: "Text and settings only. Pictures, logo, photos and videos stay in the studio — download them from each project.",
    user,
    subscription: db.prepare("SELECT status, plan_id, current_period_end, created_at FROM subscriptions WHERE user_id = ?").all(id),
    credits: db.prepare("SELECT credits FROM credit_balances WHERE user_id = ?").get(id) ?? null,
    creditTransactions: db
      .prepare("SELECT amount, type, description, created_at FROM credit_transactions WHERE user_id = ? ORDER BY created_at")
      .all(id),
    brandKit: brand ?? null,
    projects,
  };
  res.setHeader("Content-Disposition", 'attachment; filename="auteur-export.json"');
  res.json(payload);
});

authRouter.delete("/account", requireAuth, sensitive, async (req, res) => {
  const row = userRow(req.user!.id);
  if (!row) {
    res.status(401).json({ error: "Session expired. Please sign in again." });
    return;
  }
  if (!passwordOk(row, req.body?.password)) {
    res.status(403).json({ error: "Password is incorrect." });
    return;
  }
  try {
    await deleteAccount(req.user!.id);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not delete the account." });
  }
});
