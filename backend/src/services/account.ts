import fs from "node:fs";
import { db } from "../db/index.js";
import { projectMediaPath } from "./media.js";

export function deleteAccount(userId: string) {
  const projects = db.prepare("SELECT id FROM projects WHERE user_id = ?").all(userId) as { id: string }[];
  db.transaction(() => {
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
}
