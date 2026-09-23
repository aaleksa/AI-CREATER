import { randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import { config, PREVIEW_TTL_DAYS } from "../config.js";
import { hasStillFile, hasVideoFile } from "./media.js";

function parse<T>(value: unknown): T | null {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function expiresAt() {
  return new Date(Date.now() + PREVIEW_TTL_DAYS * 86400000).toISOString();
}

function liveToken(row: { preview_token: string | null; preview_expires_at: string | null }) {
  if (!row.preview_token || !row.preview_expires_at) return null;
  if (Date.parse(row.preview_expires_at) <= Date.now()) return null;
  return row.preview_token;
}

export function previewPublicUrl(token: string) {
  return `${config.appUrl.replace(/\/$/, "")}/preview/${token}`;
}

export function createPreviewLink(userId: string, projectId: string) {
  const row = db.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(projectId, userId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw Object.assign(new Error("Project not found."), { status: 404 });
  const ready = hasVideoFile(projectId) || (String(row.type) === "image_post" && Boolean(parse(row.visuals_json)));
  if (!ready) throw Object.assign(new Error("Share a preview after the pictures or Reel are ready."), { status: 400 });
  const existing = liveToken({
    preview_token: (row.preview_token as string) || null,
    preview_expires_at: (row.preview_expires_at as string) || null,
  });
  const token = existing || randomBytes(32).toString("hex");
  const until = expiresAt();
  db.prepare("UPDATE projects SET preview_token = ?, preview_expires_at = ?, updated_at = datetime('now') WHERE id = ?").run(
    token,
    until,
    projectId
  );
  return { token, url: previewPublicUrl(token), expiresAt: until };
}

export function findPreview(token: string) {
  const row = db
    .prepare("SELECT * FROM projects WHERE preview_token = ?")
    .get(token) as Record<string, unknown> | undefined;
  if (!row) return null;
  if (!row.preview_expires_at || Date.parse(String(row.preview_expires_at)) <= Date.now()) return null;
  return row;
}

export function serializePreview(row: Record<string, unknown>) {
  const id = String(row.id);
  const idea = parse<{ title?: string; concept?: string }>(row.idea_json);
  const visuals = parse<{ sceneId: number; placeholder?: boolean }[]>(row.visuals_json) || [];
  return {
    title: idea?.title || "Auteur preview",
    concept: idea?.concept || "",
    type: row.type,
    hasVideo: hasVideoFile(id),
    hasImages: String(row.type) === "image_post" && visuals.some((item) => !item.placeholder),
    slides: visuals.filter((item) => hasStillFile(id, item.sceneId)).map((item) => item.sceneId),
    expiresAt: row.preview_expires_at,
  };
}

export function expirePreviewTokens() {
  db.prepare(
    `UPDATE projects SET preview_token = NULL, preview_expires_at = NULL
     WHERE preview_expires_at IS NOT NULL AND preview_expires_at < datetime('now')`
  ).run();
}

export function previewState(row: Record<string, unknown>) {
  const token = liveToken({
    preview_token: (row.preview_token as string) || null,
    preview_expires_at: (row.preview_expires_at as string) || null,
  });
  return {
    previewUrl: token ? previewPublicUrl(token) : null,
    previewExpiresAt: token ? row.preview_expires_at : null,
  };
}
