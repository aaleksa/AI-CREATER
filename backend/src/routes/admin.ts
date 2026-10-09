import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

/**
 * Read-only look at the live database for the owner(s).
 * Off by default. Who may open it, either or both:
 *  - ADMIN_EMAILS=you@example.com[,other@example.com]  (compared with the email stored for the account)
 *  - ADMIN_USER_IDS=<account id>[,<account id>]        (stricter: ids cannot be registered by someone else)
 * Register your own account first, then add its email: sign-up does not verify email addresses,
 * so an unused address in ADMIN_EMAILS could be claimed by anyone.
 */
function list(name: string, lower = false) {
  return (process.env[name] || "")
    .split(",")
    .map((s) => (lower ? s.trim().toLowerCase() : s.trim()))
    .filter(Boolean);
}

export function isAdminUser(userId: string | undefined) {
  if (!userId) return false;
  if (list("ADMIN_USER_IDS").includes(userId)) return true;
  const emails = list("ADMIN_EMAILS", true);
  if (!emails.length) return false;
  // Current email from the database, not from the sign-in token.
  const row = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email: string } | undefined;
  return !!row && emails.includes(String(row.email).toLowerCase());
}

/** Never leave the server, even to an admin. */
const HIDDEN_COLUMNS = new Set(["password_hash", "preview_token", "token_version"]);
const MAX_CELL = 400;
const MAX_ROWS = 200;

function tableNames(): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]
  ).map((r) => r.name);
}

export const adminRouter = Router();

adminRouter.use(requireAuth, (req, res, next) => {
  // Same answer as an unknown route, so the page is not advertised to everyone else.
  if (!isAdminUser(req.user?.id)) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  next();
});

adminRouter.get("/tables", (_req, res) => {
  const tables = tableNames().map((name) => {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get() as { n: number };
    return { name, rows: Number(row.n) };
  });
  res.json({ tables });
});

adminRouter.get("/tables/:name", (req, res) => {
  const name = String(req.params.name);
  // Table name is only used if it is one of the real tables (never taken from the request into SQL).
  if (!tableNames().includes(name)) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const limit = Math.min(MAX_ROWS, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get() as { n: number }).n);
  const raw = db
    .prepare(`SELECT * FROM "${name}" ORDER BY rowid DESC LIMIT ${limit} OFFSET ${offset}`)
    .all();

  const columns = raw.length
    ? Object.keys(raw[0]).filter((c) => !HIDDEN_COLUMNS.has(c))
    : (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[])
        .map((c) => c.name)
        .filter((c) => !HIDDEN_COLUMNS.has(c));
  const rows = raw.map((r) => {
    const out: Record<string, unknown> = {};
    for (const c of columns) {
      const v = r[c];
      out[c] = typeof v === "string" && v.length > MAX_CELL ? `${v.slice(0, MAX_CELL)}… (${v.length} chars)` : v;
    }
    return out;
  });
  res.json({ name, total, limit, offset, columns, rows });
});
