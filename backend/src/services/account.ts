import fs from "node:fs";
import Stripe from "stripe";
import { db } from "../db/index.js";
import { config } from "../config.js";
import { projectMediaPath, removeBrandLogo } from "./media.js";

async function cancelStripeSubscriptions(userId: string) {
  const rows = db
    .prepare(
      `SELECT stripe_subscription_id FROM subscriptions
       WHERE user_id = ? AND stripe_subscription_id IS NOT NULL AND stripe_subscription_id != ''`
    )
    .all(userId) as { stripe_subscription_id: string }[];
  if (!rows.length || !config.stripeSecret) return;
  const stripe = new Stripe(config.stripeSecret);
  for (const row of rows) {
    try {
      await stripe.subscriptions.cancel(row.stripe_subscription_id);
    } catch (error) {
      console.error("Stripe cancel failed", row.stripe_subscription_id, error);
    }
  }
}

export async function deleteAccount(userId: string) {
  await cancelStripeSubscriptions(userId);
  const projects = db.prepare("SELECT id FROM projects WHERE user_id = ?").all(userId) as { id: string }[];
  db.transaction(() => {
    db.prepare("DELETE FROM project_feedback WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM step_feedback WHERE project_id IN (SELECT id FROM projects WHERE user_id = ?)").run(userId);
    db.prepare("DELETE FROM project_step_versions WHERE project_id IN (SELECT id FROM projects WHERE user_id = ?)").run(userId);
    db.prepare("DELETE FROM ai_generations WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM credit_transactions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM credit_balances WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM brand_kits WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM subscriptions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM projects WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  })();
  for (const project of projects) {
    fs.rmSync(projectMediaPath(project.id), { recursive: true, force: true });
  }
  removeBrandLogo(userId);
}
