import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

/**
 * Read-only look at the live database for the owner(s).
 * Off by default: set ADMIN_USER_IDS=<account id>[,<account id>] on the server.
 * Ids, not emails: anyone can sign up with an unused email, nobody can sign up with someone's id.
 * The id is shown on the Account page.
 */
function adminIds() {
  return (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminId(id: string | undefined) {
  return !!id && adminIds().includes(id);
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
  if (!isAdminId(req.user?.id)) {
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
