import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { once } from "node:events";
import { Writable } from "node:stream";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { dataDir } from "../dataDir.js";
import { FREE_CREDITS } from "../config.js";
import { ensureCreditAccount } from "./credits.js";
import { FREE_CREDITS_NOTE } from "./emailVerification.js";

/** The upload is unpacked here, then its files are moved into media/. */
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
/** account.json, and files under media/<projectId>/ or media/brand/account/ — nothing else is written. */
const ALLOWED = /^(account\.json|media\/(brand\/account|[A-Za-z0-9-]{8,64})\/[^/].*)$/;

/** Reads a .tar stream and writes its plain files into one folder; links, devices, macOS "._" files and anything outside are skipped. */
class TarToFolder extends Writable {
  private buf: Buffer = Buffer.alloc(0);
  private left = 0;
  private pad = 0;
  private fd: number | null = null;
  private meta: Buffer[] | null = null;
  private metaKind = "";
  private nextPath = "";
  private total = 0;
  files = 0;

  constructor(private readonly dir: string) {
    super();
  }

  _write(chunk: Buffer, _enc: BufferEncoding, done: (err?: Error | null) => void) {
    try {
      this.total += chunk.length;
      if (this.total > ARCHIVE_MAX) throw Object.assign(new Error("The archive is too big."), { status: 413 });
      this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
      this.consume();
      done();
    } catch (err) {
      this.closeFile();
      done(err as Error);
    }
  }

  _final(done: (err?: Error | null) => void) {
    this.closeFile();
    done(this.left > 0 ? Object.assign(new Error("The archive ends too early — upload it again."), { status: 400 }) : null);
  }

  private consume() {
    for (;;) {
      if (this.left > 0) {
        if (!this.buf.length) return;
        const take = Math.min(this.left, this.buf.length);
        const piece = this.buf.subarray(0, take);
        if (this.fd != null) fs.writeSync(this.fd, piece);
        else if (this.meta) this.meta.push(Buffer.from(piece));
        this.buf = this.buf.subarray(take);
        this.left -= take;
        if (this.left > 0) return;
        this.endEntry();
      }
      if (this.pad > 0) {
        const take = Math.min(this.pad, this.buf.length);
        this.buf = this.buf.subarray(take);
        this.pad -= take;
        if (this.pad > 0) return;
      }
      if (this.buf.length < 512) return;
      const header = this.buf.subarray(0, 512);
      this.buf = this.buf.subarray(512);
      if (header.every((b) => b === 0)) continue;
      this.startEntry(header);
    }
  }

  private startEntry(h: Buffer) {
    const text = (from: number, len: number) => h.subarray(from, from + len).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(text(124, 12).trim() || "0", 8) || 0;
    const type = String.fromCharCode(h[156] || 48);
    const prefix = text(257, 6).startsWith("ustar") ? text(345, 155) : "";
    let name = prefix ? `${prefix}/${text(0, 100)}` : text(0, 100);
    if (this.nextPath) name = this.nextPath;
    this.left = size;
    this.pad = (512 - (size % 512)) % 512;
    if (type === "x" || type === "L") {
      this.meta = [];
      this.metaKind = type;
      return;
    }
    this.nextPath = "";
    if (type === "g") {
      this.meta = null;
      return;
    }
    const clean = name.replace(/^(\.\/)+/, "");
    const parts = clean.split("/");
    if ((type === "0" || type === "\0") && ALLOWED.test(clean) && !parts.some((p) => p === ".." || p === "." || p === "" || p.startsWith("._"))) {
      const dest = path.join(this.dir, clean);
      if (!dest.startsWith(this.dir + path.sep)) return;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      this.fd = fs.openSync(dest, "w");
      this.files++;
    }
    if (size === 0) this.endEntry();
  }

  private endEntry() {
    if (this.meta) {
      const body = Buffer.concat(this.meta).toString("utf8");
      if (this.metaKind === "L") this.nextPath = body.replace(/\0.*$/s, "");
      else {
        const found = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body);
        if (found) this.nextPath = found[1];
      }
      this.meta = null;
    }
    this.closeFile();
  }

  private closeFile() {
    if (this.fd != null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }
}

/** One upload at a time: the parts are unpacked as they arrive, so the archive itself is never kept on the disk. */
type Session = { id: string; next: number; gunzip: zlib.Gunzip; tar: TarToFolder; done: Promise<void>; error?: Error };
let session: Session | null = null;

function dropSession() {
  if (session) {
    session.gunzip.destroy();
    session.tar.destroy();
  }
  session = null;
  fs.rmSync(IMPORT_DIR, { recursive: true, force: true });
}

function startSession(id: string): Session {
  dropSession();
  const dir = path.join(IMPORT_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const gunzip = zlib.createGunzip();
  const tar = new TarToFolder(dir);
  const s: Session = { id, next: 0, gunzip, tar, done: Promise.resolve() };
  s.done = new Promise<void>((resolve) => {
    const fail = (err: Error) => {
      s.error ||= err;
      resolve();
    };
    gunzip.on("error", fail);
    tar.on("error", fail);
    tar.on("finish", () => resolve());
  });
  gunzip.pipe(tar);
  session = s;
  return s;
}

function failure(err: Error) {
  const message = /ENOSPC/.test(String(err.message)) ? "The server disk is full." : err.message;
  return Object.assign(new Error(message), { status: (err as { status?: number }).status || 500 });
}

/** One part of the archive, in order 0, 1, 2… Part 0 starts a new upload (and clears any unfinished one). */
export async function saveImportChunk(uploadId: string, index: number, body: NodeJS.ReadableStream) {
  if (!SAFE_ID.test(uploadId)) throw Object.assign(new Error("Unknown upload."), { status: 400 });
  if (!Number.isInteger(index) || index < 0 || index > 999) throw Object.assign(new Error("Bad part number."), { status: 400 });
  const s = index === 0 ? startSession(uploadId) : session;
  if (!s || s.id !== uploadId || s.next !== index) {
    throw Object.assign(new Error("This upload was interrupted — start the import again."), { status: 409 });
  }
  let size = 0;
  try {
    for await (const chunk of body as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > CHUNK_MAX) throw Object.assign(new Error("A part is too big."), { status: 413 });
      if (s.error) throw s.error;
      if (!s.gunzip.write(chunk)) await once(s.gunzip, "drain");
    }
    if (s.error) throw s.error;
  } catch (err) {
    dropSession();
    throw failure(err as Error);
  }
  s.next++;
  return { received: index, size };
}

/** All parts are in: finish unpacking and add the account to this server. */
export async function finishImport(uploadId: string) {
  const s = session;
  if (!s || s.id !== uploadId) throw Object.assign(new Error("Nothing was uploaded — start the import again."), { status: 409 });
  try {
    s.gunzip.end();
    await s.done;
    if (s.error) throw s.error;
    return importFolder(path.join(IMPORT_DIR, uploadId));
  } catch (err) {
    throw failure(err as Error);
  } finally {
    dropSession();
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

function importFolder(into: string) {
  if (!fs.existsSync(path.join(into, "account.json"))) {
    throw Object.assign(new Error("This is not an account export."), { status: 400 });
  }
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
