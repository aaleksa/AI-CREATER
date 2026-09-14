import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new DatabaseSync(path.join(dataDir, "auteur.db"));
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");
sqlite.exec(SCHEMA_SQL);

let savepoint = 0;

function named(args: unknown[]) {
  if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
    const obj = args[0] as Record<string, unknown>;
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      mapped[/^[@:$]/.test(key) ? key : `@${key}`] = value;
    }
    return [mapped] as unknown[];
  }
  return args;
}

function wrap(statement: ReturnType<DatabaseSync["prepare"]>) {
  return {
    run: (...args: unknown[]) => statement.run(...named(args)),
    get: (...args: unknown[]) => statement.get(...named(args)) as Record<string, unknown> | undefined,
    all: (...args: unknown[]) => statement.all(...named(args)) as Record<string, unknown>[],
  };
}

export const db = {
  exec: (sql: string) => sqlite.exec(sql),
  prepare: (sql: string) => wrap(sqlite.prepare(sql)),
  transaction<T>(fn: () => T): () => T {
    return () => {
      const sp = `sp_${++savepoint}`;
      sqlite.exec(`SAVEPOINT ${sp}`);
      try {
        const result = fn();
        sqlite.exec(`RELEASE ${sp}`);
        return result;
      } catch (error) {
        sqlite.exec(`ROLLBACK TO ${sp}`);
        sqlite.exec(`RELEASE ${sp}`);
        throw error;
      }
    };
  },
};

const upsertPlan = db.prepare(
  `INSERT INTO plans (id, name, price_gbp, monthly_credits, description)
   VALUES (@id, @name, @price_gbp, @monthly_credits, @description)
   ON CONFLICT(id) DO UPDATE SET
     name = excluded.name,
     price_gbp = excluded.price_gbp,
     monthly_credits = excluded.monthly_credits,
     description = excluded.description`
);
for (const plan of [
  { id: "free", name: "Free", price_gbp: 0, monthly_credits: 200, description: "Enough for one finished Reel." },
  { id: "creator", name: "Creator", price_gbp: 999, monthly_credits: 1000, description: "A week of Reels and posts." },
  { id: "pro", name: "Pro", price_gbp: 2499, monthly_credits: 3500, description: "Daily publishing." },
  { id: "business", name: "Business", price_gbp: 4999, monthly_credits: 8000, description: "Brand kit at volume." },
]) {
  upsertPlan.run(plan);
}
