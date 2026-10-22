import fs from "node:fs";
import path from "node:path";
import { db } from "../db/index.js";
import { hasStillFiles, hasVideoFile, projectMediaPath, removeMusicFile, removeStillFiles, removeVoiceFile, removeVideoFile } from "./media.js";

function removeCleanStills(projectId: string) {
  const dir = projectMediaPath(projectId);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) if (name.startsWith("clean-")) fs.rmSync(path.join(dir, name), { force: true });
}
import { refreshDueLearnedSummaries } from "./learning.js";
import { expirePreviewTokens } from "./share.js";

function ageDays(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return (Date.now() - t) / 86400000;
}

/** What a finished Reel or picture needs to be shown and made again: kept until the 90-day clean-up. */
const KEEP = (name: string) =>
  name === "reel.mp4" ||
  name === "music.m4a" ||
  name.startsWith("still-") ||
  name.startsWith("example-") ||
  // The pictures without our logo: every logo move, removal and edit starts from them. Lost, the logo doubles.
  name.startsWith("clean-");

function removeIntermediates(projectId: string) {
  const dir = projectMediaPath(projectId);
  if (!fs.existsSync(dir)) return;
  removeVoiceFile(projectId);
  for (const name of fs.readdirSync(dir)) {
    if (KEEP(name)) continue;
    // Folders too (the caption fonts): a plain rm throws on a folder.
    fs.rmSync(path.join(dir, name), { force: true, recursive: true });
  }
}

export function runMaintenance() {
  cleanupExpiredMedia();
  expirePreviewTokens();
  refreshDueLearnedSummaries();
}

export function cleanupExpiredMedia() {
  const rows = db.prepare("SELECT id, updated_at, status FROM projects").all() as {
    id: string;
    updated_at: string;
    status: string;
  }[];
  for (const row of rows) {
    // One project's files must never stop the clean-up (or the server start) for the rest.
    try {
      cleanupProject(row);
    } catch (error) {
      console.error("media clean-up failed", row.id, error instanceof Error ? error.message : error);
    }
  }
}

function cleanupProject(row: { id: string; updated_at: string; status: string }) {
  const days = ageDays(row.updated_at);
  if (days > 7) removeIntermediates(row.id);
  if (days > 90 && (hasVideoFile(row.id) || hasStillFiles(row.id))) {
    removeVideoFile(row.id);
    removeStillFiles(row.id);
    removeMusicFile(row.id);
    removeCleanStills(row.id);
    // Whatever it was (a failed edit can leave a finished post as a draft), there is nothing to show any more.
    if (row.status !== "expired") {
      db.prepare("UPDATE projects SET status = 'expired', output_url = NULL, updated_at = datetime('now') WHERE id = ?").run(
        row.id
      );
    }
  }
}
