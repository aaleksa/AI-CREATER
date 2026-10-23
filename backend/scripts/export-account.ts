/**
 * Packs one account — the user, the brand kit, every project with its versions, feedback and generation history, and
 * all their files — into one .tar.gz for "Import an account" on the Database page of another server.
 * Credits and the plan are not moved: the other server keeps its own.
 *
 *   npx tsx scripts/export-account.ts you@example.com [out.tar.gz]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { db } from "../src/db/index.js";
import { dataDir } from "../src/dataDir.js";

const email = String(process.argv[2] || "").toLowerCase().trim();
if (!email) {
  console.error("Usage: npx tsx scripts/export-account.ts you@example.com [out.tar.gz]");
  process.exit(1);
}
const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as Record<string, unknown> | undefined;
if (!user) {
  console.error(`No account with ${email} here.`);
  process.exit(1);
}
const userId = String(user.id);
const rows = (sql: string, ...args: unknown[]) => db.prepare(sql).all(...(args as never[])) as Record<string, unknown>[];
const projects = rows("SELECT * FROM projects WHERE user_id = ?", userId);
const ids = projects.map((p) => String(p.id));
const inProjects = (table: string) =>
  ids.length ? rows(`SELECT * FROM ${table} WHERE project_id IN (${ids.map(() => "?").join(",")})`, ...ids) : [];

const payload = {
  format: "auteur-account-1",
  exportedAt: new Date().toISOString(),
  user,
  brandKits: rows("SELECT * FROM brand_kits WHERE user_id = ?", userId),
  projects,
  versions: inProjects("project_step_versions"),
  stepFeedback: inProjects("step_feedback"),
  projectFeedback: inProjects("project_feedback"),
  generations: inProjects("ai_generations"),
};

const work = fs.mkdtempSync(path.join(os.tmpdir(), "auteur-export-"));
fs.writeFileSync(path.join(work, "account.json"), JSON.stringify(payload));
const media = path.join(dataDir, "media");
fs.mkdirSync(path.join(work, "media", "brand"), { recursive: true });
let files = 0;
for (const id of ids) {
  const from = path.join(media, id);
  if (!fs.existsSync(from)) continue;
  fs.cpSync(from, path.join(work, "media", id), { recursive: true, dereference: true });
  files += fs.readdirSync(from).length;
}
const brandDir = path.join(media, "brand", userId);
if (fs.existsSync(brandDir)) fs.cpSync(brandDir, path.join(work, "media", "brand", "account"), { recursive: true, dereference: true });

const stamp = new Date().toISOString().slice(0, 10);
const out = path.resolve(process.argv[3] || path.join(os.homedir(), "Downloads", `auteur-${email.replace(/[^a-z0-9]+/g, "-")}-${stamp}.tar.gz`));
// No macOS "._" side files or extended attributes in the archive.
execFileSync("tar", ["--no-xattrs", "--no-mac-metadata", "-czf", out, "-C", work, "account.json", "media"], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
fs.rmSync(work, { recursive: true, force: true });
const size = fs.statSync(out).size;
console.log(`Saved ${out}`);
console.log(`${projects.length} projects, ${payload.versions.length} versions, ${files} files, ${(size / 1024 / 1024).toFixed(1)} MB`);
