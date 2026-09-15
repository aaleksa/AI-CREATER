import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";

export function getBalance(userId: string) {
  const row = db.prepare("SELECT credits FROM credit_balances WHERE user_id = ?").get(userId) as
    | { credits: number }
    | undefined;
  return Number(row?.credits ?? 0);
}

export function ensureCreditAccount(userId: string, amount: number, description: string) {
  const row = db.prepare("SELECT user_id FROM credit_balances WHERE user_id = ?").get(userId);
  if (!row) grantCredits(userId, amount, "grant", description);
}

export function grantCredits(userId: string, amount: number, type: string, description: string) {
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO credit_balances (user_id, credits, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         credits = credits + excluded.credits,
         updated_at = datetime('now')`
    ).run(userId, amount);
    db.prepare(
      `INSERT INTO credit_transactions (id, user_id, amount, type, description)
       VALUES (?, ?, ?, ?, ?)`
    ).run(uuid(), userId, amount, type, description);
  });
  tx();
  return getBalance(userId);
}

export function spendCredits(
  userId: string,
  amount: number,
  description: string,
  generationId?: string
) {
  const current = getBalance(userId);
  if (current < amount) {
    const err = new Error("Not enough credits") as Error & { status: number };
    err.status = 402;
    throw err;
  }
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE credit_balances
       SET credits = credits - ?, updated_at = datetime('now')
       WHERE user_id = ?`
    ).run(amount, userId);
    db.prepare(
      `INSERT INTO credit_transactions (id, user_id, amount, type, description, generation_id)
       VALUES (?, ?, ?, 'spend', ?, ?)`
    ).run(uuid(), userId, -amount, description, generationId ?? null);
  });
  tx();
  return getBalance(userId);
}

export function refundCredits(userId: string, amount: number, description: string) {
  if (amount <= 0) return getBalance(userId);
  return grantCredits(userId, amount, "refund", description);
}
