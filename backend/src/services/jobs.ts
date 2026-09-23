import fs from "node:fs";
import path from "node:path";
import { db } from "../db/index.js";
import { hasStillFiles, hasVideoFile, projectMediaPath, removeStillFiles, removeVoiceFile, removeVideoFile } from "./media.js";
import { refreshDueLearnedSummaries } from "./learning.js";
import { expirePreviewTokens } from "./share.js";

function ageDays(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return (Date.now() - t) / 86400000;
}

function removeIntermediates(projectId: string) {
  const dir = projectMediaPath(projectId);
  if (!fs.existsSync(dir)) return;
  removeVoiceFile(projectId);
  for (const name of fs.readdirSync(dir)) {
    if (name === "reel.mp4" || name.startsWith("still-")) continue;
    fs.rmSync(path.join(dir, name), { force: true });
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
    const days = ageDays(row.updated_at);
    if (days > 7) removeIntermediates(row.id);
    if (days > 90 && (hasVideoFile(row.id) || hasStillFiles(row.id))) {
      removeVideoFile(row.id);
      removeStillFiles(row.id);
      if (row.status === "ready") {
        db.prepare("UPDATE projects SET status = 'expired', output_url = NULL, updated_at = datetime('now') WHERE id = ?").run(
          row.id
        );
      }
    }
  }
}
