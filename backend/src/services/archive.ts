import { ARCHIVE_FULL_ERROR, ARCHIVE_LIMITS } from "../config.js";
import { db } from "../db/index.js";
import { hasVideoFile, removeVideoFile } from "./media.js";

export type ArchiveState = {
  used: number;
  limit: number;
  planId: string;
  atLimit: boolean;
  oldestId: string | null;
  oldestPrompt: string | null;
};

function userPlanId(userId: string) {
  const row = db
    .prepare(
      `SELECT p.id AS plan_id
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
       WHERE s.user_id = ? AND s.status = 'active'
       ORDER BY s.created_at DESC LIMIT 1`
    )
    .get(userId) as { plan_id: string } | undefined;
  return row?.plan_id || "free";
}

export function archiveLimitForUser(userId: string) {
  const planId = userPlanId(userId);
  return ARCHIVE_LIMITS[planId] ?? ARCHIVE_LIMITS.free;
}

function readyVideos(userId: string) {
  const rows = db
    .prepare(
      `SELECT id, prompt, created_at
       FROM projects
       WHERE user_id = ? AND type IN ('instagram_reel', 'tiktok')
       ORDER BY created_at ASC`
    )
    .all(userId) as { id: string; prompt: string; created_at: string }[];
  return rows.filter((row) => hasVideoFile(row.id));
}

export function archiveState(userId: string): ArchiveState {
  const planId = userPlanId(userId);
  const limit = ARCHIVE_LIMITS[planId] ?? ARCHIVE_LIMITS.free;
  const videos = readyVideos(userId);
  const oldest = videos[0];
  return {
    used: videos.length,
    limit,
    planId,
    atLimit: videos.length >= limit,
    oldestId: oldest?.id || null,
    oldestPrompt: oldest ? oldest.prompt.replace(/\s+/g, " ").slice(0, 80) : null,
  };
}

function evictOldestReadyVideo(userId: string, keepProjectId: string) {
  const oldest = readyVideos(userId).find((row) => row.id !== keepProjectId);
  if (!oldest) return null;
  removeVideoFile(oldest.id);
  db.prepare("UPDATE projects SET status = 'expired', output_url = NULL, updated_at = datetime('now') WHERE id = ?").run(
    oldest.id
  );
  return oldest;
}

export function assertArchiveRoom(userId: string, projectId: string, evictOldest: boolean) {
  if (hasVideoFile(projectId)) return;
  const state = archiveState(userId);
  if (state.used < state.limit) return;
  if (!evictOldest) {
    throw Object.assign(new Error(ARCHIVE_FULL_ERROR), { status: 409, code: "archive_full" });
  }
}

export function evictOverLimit(userId: string, keepProjectId: string) {
  const limit = archiveLimitForUser(userId);
  let guard = 0;
  while (readyVideos(userId).length > limit && guard < 16) {
    if (!evictOldestReadyVideo(userId, keepProjectId)) break;
    guard += 1;
  }
}
