import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { dataDir } from "../dataDir.js";
import { FREE_CREDITS } from "../config.js";
import { ensureCreditAccount } from "./credits.js";
import { FREE_CREDITS_NOTE } from "./emailVerification.js";

/** Chunks of an upload land here until the last one arrives. */
const IMPORT_DIR = path.join(dataDir, "import");
const CHUNK_MAX = 25 * 1024 * 1024;
const ARCHIVE_MAX = 2 * 1024 * 1024 * 1024;

type Row = Record<string, unknown>;
type Payload = {
  format: string;
  user: Row;
  brandKits: Row[];
  projects: Row[];
  versions: Row[];
  stepFeedback: Row[];
  projectFeedback: Row[];
  generations: Row[];
};

function columns(table: string) {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
}

/** Inserts a row with only the columns this server has (the two databases may be a migration apart). */
function put(table: string, row: Row, mode: "REPLACE" | "IGNORE") {
  const have = columns(table);
  const keys = Object.keys(row).filter((key) => have.has(key));
  if (!keys.length) return;
  db.prepare(`INSERT OR ${mode} INTO ${table} (${keys.join(", ")}) VALUES (${keys.map((k) => `@${k}`).join(", ")})`).run(
    Object.fromEntries(keys.map((k) => [k, row[k] as never]))
  );
}

const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

function uploadDir(uploadId: string) {
  if (!SAFE_ID.test(uploadId)) throw Object.assign(new Error("Unknown upload."), { status: 400 });
  return path.join(IMPORT_DIR, uploadId);
}

/** One part of the archive (sent in order, 0, 1, 2…). */
export async function saveImportChunk(uploadId: string, index: number, body: NodeJS.ReadableStream) {
  const dir = uploadDir(uploadId);
  if (!Number.isInteger(index) || index < 0 || index > 999) throw Object.assign(new Error("Bad part number."), { status: 400 });
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `part-${String(index).padStart(4, "0")}`);
  let size = 0;
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(file);
    body.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > CHUNK_MAX) {
        out.destroy();
        reject(Object.assign(new Error("A part is too big."), { status: 413 }));
      }
    });
    body.on("error", reject);
    out.on("error", reject);
    out.on("finish", () => resolve());
    body.pipe(out);
  });
  return { received: index, size };
}

/** All parts are in: put them together, check the archive and add the account to this server. */
export function finishImport(uploadId: string) {
  const dir = uploadDir(uploadId);
  const parts = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.startsWith("part-")).sort() : [];
  if (!parts.length) throw Object.assign(new Error("Nothing was uploaded."), { status: 400 });
  const archive = path.join(dir, "account.tar.gz");
  const out = fs.openSync(archive, "w");
  let total = 0;
  for (const part of parts) {
    const buf = fs.readFileSync(path.join(dir, part));
    total += buf.length;
    if (total > ARCHIVE_MAX) {
      fs.closeSync(out);
      fs.rmSync(dir, { recursive: true, force: true });
      throw Object.assign(new Error("The archive is too big."), { status: 413 });
    }
    fs.writeSync(out, buf);
    fs.rmSync(path.join(dir, part));
  }
  fs.closeSync(out);
  try {
    return importArchive(archive, path.join(dir, "x"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Moves the files of one folder into another (same disk, so no second copy), replacing files with the same name. */
function moveInto(from: string, to: string): number {
  fs.mkdirSync(to, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      count += moveInto(src, dest);
    } else if (entry.isFile()) {
      fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(src, dest);
      count++;
    }
  }
  return count;
}

function importArchive(archive: string, into: string) {
  // Only plain files under account.json and media/ — nothing that could step outside the folder.
  const listing = execFileSync("tar", ["-tzf", archive], { maxBuffer: 64 * 1024 * 1024 }).toString().split("\n").filter(Boolean);
  for (const name of listing) {
    const clean = name.replace(/^\.\//, "");
    if (path.isAbsolute(clean) || clean.split("/").includes("..") || !(clean === "account.json" || clean.startsWith("media/") || clean === "media")) {
      throw Object.assign(new Error(`Unexpected file in the archive: ${name.slice(0, 80)}`), { status: 400 });
    }
  }
  fs.mkdirSync(into, { recursive: true });
  execFileSync("tar", ["-xzf", archive, "-C", into, "--no-same-owner", "--no-same-permissions"]);
  fs.rmSync(archive);
  const payload = JSON.parse(fs.readFileSync(path.join(into, "account.json"), "utf8")) as Payload;
  if (payload.format !== "auteur-account-1" || !payload.user?.email) {
    throw Object.assign(new Error("This is not an account export."), { status: 400 });
  }
  const email = String(payload.user.email).toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string } | undefined;
  const targetId = existing?.id || (db.prepare("SELECT 1 FROM users WHERE id = ?").get(String(payload.user.id)) ? uuid() : String(payload.user.id));
  const mine = (row: Row) => ({ ...row, user_id: targetId });

  db.transaction(() => {
    if (!existing) {
      // A new account here: same name, email and password as there; this server's own free credits and plan.
      put("users", { ...payload.user, id: targetId, email }, "IGNORE");
      db.prepare("INSERT OR IGNORE INTO subscriptions (id, user_id, plan_id, status) VALUES (?, ?, 'free', 'active')").run(uuid(), targetId);
    }
    if (payload.brandKits.length) {
      db.prepare("DELETE FROM brand_kits WHERE user_id = ?").run(targetId);
      for (const kit of payload.brandKits) put("brand_kits", { ...mine(kit), id: uuid() }, "REPLACE");
    }
    for (const project of payload.projects) put("projects", mine(project), "REPLACE");
    for (const row of payload.versions) put("project_step_versions", row, "IGNORE");
    for (const row of payload.stepFeedback) put("step_feedback", row, "IGNORE");
    for (const row of payload.projectFeedback) put("project_feedback", mine(row), "IGNORE");
    for (const row of payload.generations) put("ai_generations", mine(row), "IGNORE");
  })();
  if (!existing) ensureCreditAccount(targetId, FREE_CREDITS, FREE_CREDITS_NOTE);

  // Files: each project's folder, and the brand kit's under this server's account id.
  const media = path.join(dataDir, "media");
  let files = 0;
  const projectIds = new Set(payload.projects.map((p) => String(p.id)));
  const fromMedia = path.join(into, "media");
  if (fs.existsSync(fromMedia)) {
    for (const name of fs.readdirSync(fromMedia)) {
      const src = path.join(fromMedia, name);
      if (name === "brand") {
        const brand = path.join(src, "account");
        if (fs.existsSync(brand)) moveInto(brand, path.join(media, "brand", targetId));
        continue;
      }
      if (!projectIds.has(name) || !fs.statSync(src).isDirectory()) continue;
      files += moveInto(src, path.join(media, name));
    }
  }
  return { email, accountExisted: Boolean(existing), projects: payload.projects.length, versions: payload.versions.length, files };
}
