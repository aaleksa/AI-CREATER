import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { FREE_CREDITS } from "../config.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { ensureCreditAccount, grantCredits } from "../services/credits.js";

export const authRouter = Router();

function ensureBrandKit(userId: string, name: string) {
  const existing = db.prepare("SELECT id FROM brand_kits WHERE user_id = ?").get(userId);
  if (!existing) {
    db.prepare(`INSERT INTO brand_kits (id, user_id, business_name) VALUES (?, ?, ?)`).run(uuid(), userId, name);
  }
}

authRouter.post("/signup", (req, res) => {
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
    db.transaction(() => {
      db.prepare("INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)").run(
        id,
        normalised,
        bcrypt.hashSync(String(password), 10),
        String(name)
      );
      db.prepare("INSERT INTO subscriptions (id, user_id, plan_id, status) VALUES (?, ?, 'free', 'active')").run(uuid(), id);
      grantCredits(id, FREE_CREDITS, "grant", "Free plan credits");
      db.prepare(`INSERT INTO brand_kits (id, user_id, business_name) VALUES (?, ?, ?)`).run(uuid(), id, String(name));
    })();
    const user = { id, email: normalised, name: String(name) };
    res.json({ token: signToken(user), user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not create the account." });
  }
});

authRouter.post("/login", (req, res) => {
  const { email, password } = req.body ?? {};
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email || "").toLowerCase().trim()) as
    | { id: string; email: string; name: string; password_hash: string }
    | undefined;
  if (!row || !bcrypt.compareSync(String(password || ""), row.password_hash)) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  ensureCreditAccount(row.id, FREE_CREDITS, "Free plan credits");
  ensureBrandKit(row.id, row.name);
  const user = { id: row.id, email: row.email, name: row.name };
  res.json({ token: signToken(user), user });
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, email, name, created_at FROM users WHERE id = ?").get(req.user!.id) as
    | { id: string; email: string; name: string; created_at: string }
    | undefined;
  if (!user) {
    res.status(401).json({ error: "Session expired. Please sign in again." });
    return;
  }
  ensureCreditAccount(user.id, FREE_CREDITS, "Free plan credits");
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
  res.json({ user, subscription: sub ?? null, credits: Number(credits?.credits ?? 0) });
});
