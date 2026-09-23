import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { CREDIT_COSTS, FULL_IMAGE_COST, FULL_INVITE_COST, FULL_VIDEO_COST, MAX_PROMPT_CHARS, MIN_PROMPT_CHARS } from "../config.js";
import { FORMAT_TYPES, MVP_READY, createProject, readCreateImageIntent, restoreStepVersion, runStep, saveFeedback, serializeProject, updateInvite } from "../services/pipeline.js";
import { createPreviewLink, findPreview, serializePreview } from "../services/share.js";
import { hasStillFile, hasStillVersionFile, hasVideoFile, hasVoiceFile, removeProjectMedia, stillFile, stillVersionFile, videoFile, voiceFile } from "../services/media.js";
import { archiveState } from "../services/archive.js";
import { rateLimit } from "../middleware/rateLimit.js";

function readPrompt(value: unknown) {
  const text = String(value || "").trim();
  if (text.length < MIN_PROMPT_CHARS) {
    return { error: "Tell us what you want to create — a sentence is enough, more is fine." };
  }
  if (text.length > MAX_PROMPT_CHARS) {
    return { error: "That’s too long. Keep it under 2,000 characters." };
  }
  return { text };
}

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.user!.id) as Record<string, unknown>[];
  res.json({
    projects: rows.map(serializeProject),
    archive: archiveState(req.user!.id),
    costs: CREDIT_COSTS,
    fullVideoCost: FULL_VIDEO_COST,
    fullImageCost: FULL_IMAGE_COST,
    fullInviteCost: FULL_INVITE_COST,
  });
});

projectsRouter.post("/", (req, res) => {
  const { type, prompt, imageIntent } = req.body ?? {};
  if (!FORMAT_TYPES.includes(type as (typeof FORMAT_TYPES)[number])) {
    res.status(400).json({ error: "Unknown format." });
    return;
  }
  const parsed = readPrompt(prompt);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (!MVP_READY.includes(type as (typeof FORMAT_TYPES)[number])) {
    res.status(400).json({
      error: "This format is next. Start with a short video or still images.",
    });
    return;
  }
  const intent = readCreateImageIntent(type, imageIntent);
  if ("error" in intent) {
    res.status(400).json({ error: intent.error });
    return;
  }
  const useBrand = req.body?.useBrand !== false && req.body?.useBrand !== 0;
  const project = createProject(req.user!.id, type as (typeof FORMAT_TYPES)[number], parsed.text, intent.intent, useBrand);
  res.status(201).json({ project: serializeProject(project) });
});

projectsRouter.get("/:id/file", (req, res) => {
  const id = String(req.params.id);
  const row = db.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?").get(id, req.user!.id);
  if (!row || !hasVideoFile(id)) {
    res.status(404).json({ error: "Video not ready." });
    return;
  }
  res.type("video/mp4");
  res.sendFile(videoFile(id));
});

projectsRouter.get("/:id/image/:sceneId/versions/:versionId", (req, res) => {
  const id = String(req.params.id);
  const sceneId = Number(req.params.sceneId);
  const versionId = String(req.params.versionId);
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) {
    res.status(404).json({ error: "Image not ready." });
    return;
  }
  const row = db.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?").get(id, req.user!.id);
  const version = db
    .prepare("SELECT id FROM project_step_versions WHERE id = ? AND project_id = ? AND step = 'visuals'")
    .get(versionId, id);
  if (!row || !version || !hasStillVersionFile(id, sceneId, versionId)) {
    res.status(404).json({ error: "Image not ready." });
    return;
  }
  res.type("image/jpeg");
  res.sendFile(stillVersionFile(id, sceneId, versionId));
});

projectsRouter.get("/:id/image/:sceneId", (req, res) => {
  const id = String(req.params.id);
  const sceneId = Number(req.params.sceneId);
  const row = db.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?").get(id, req.user!.id);
  if (!row || !hasStillFile(id, sceneId)) {
    res.status(404).json({ error: "Image not ready." });
    return;
  }
  res.type("image/jpeg");
  res.sendFile(stillFile(id, sceneId));
});

projectsRouter.get("/:id/audio", (req, res) => {
  const id = String(req.params.id);
  const row = db.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?").get(id, req.user!.id);
  if (!row || !hasVoiceFile(id)) {
    res.status(404).json({ error: "Audio not ready." });
    return;
  }
  res.type("audio/mpeg");
  res.sendFile(voiceFile(id));
});

projectsRouter.delete("/:id", (req, res) => {
  const id = String(req.params.id);
  const row = db.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?").get(id, req.user!.id);
  if (!row) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  const wipe = db.transaction(() => {
    db.prepare("DELETE FROM step_feedback WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM project_feedback WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM project_step_versions WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM ai_generations WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(id, req.user!.id);
  });
  wipe();
  removeProjectMedia(id);
  res.json({ ok: true });
});

projectsRouter.get("/:id", (req, res) => {
  const id = String(req.params.id);
  const row = db
    .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
    .get(id, req.user!.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  res.json({
    project: serializeProject(row),
    archive: archiveState(req.user!.id),
    costs: CREDIT_COSTS,
    fullVideoCost: FULL_VIDEO_COST,
    fullImageCost: FULL_IMAGE_COST,
    fullInviteCost: FULL_INVITE_COST,
  });
});

projectsRouter.patch("/:id/invite", async (req, res) => {
  try {
    const project = await updateInvite(req.user!.id, String(req.params.id), req.body?.invite ?? req.body);
    res.json({ project });
  } catch (error) {
    const err = error as Error & { status?: number };
    res.status(err.status || 500).json({ error: err.message || "Could not update the invitation." });
  }
});

projectsRouter.patch("/:id", (req, res) => {
  const id = String(req.params.id);
  const row = db
    .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
    .get(id, req.user!.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  const hasPrompt = req.body?.prompt != null;
  const hasBrand = req.body?.useBrand != null;
  if (!hasPrompt && !hasBrand) {
    res.status(400).json({ error: "Tell us what you want to create — a sentence is enough, more is fine." });
    return;
  }
  if (hasPrompt) {
    const parsed = readPrompt(req.body?.prompt);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    db.prepare("UPDATE projects SET prompt = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(
      parsed.text,
      id,
      req.user!.id
    );
  }
  if (hasBrand) {
    db.prepare("UPDATE projects SET use_brand = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(
      req.body.useBrand === false || req.body.useBrand === 0 ? 0 : 1,
      id,
      req.user!.id
    );
  }
  const next = db.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(id, req.user!.id) as Record<string, unknown>;
  res.json({ project: serializeProject(next) });
});

projectsRouter.post("/:id/share", (req, res) => {
  try {
    const link = createPreviewLink(req.user!.id, String(req.params.id));
    res.json(link);
  } catch (error) {
    const err = error as Error & { status?: number };
    res.status(err.status || 500).json({ error: err.message || "Could not create a preview link." });
  }
});

projectsRouter.post("/:id/versions/:step/:versionId/restore", (req, res) => {
  const step = String(req.params.step);
  if (step !== "idea" && step !== "script" && step !== "visuals") {
    res.status(400).json({ error: "Only idea, script and picture versions can be restored." });
    return;
  }
  const sceneRaw = req.body?.sceneId;
  const sceneId = Number.isFinite(Number(sceneRaw)) ? Number(sceneRaw) : undefined;
  try {
    const project = restoreStepVersion(req.user!.id, String(req.params.id), step, String(req.params.versionId), sceneId);
    res.json({ project });
  } catch (error) {
    const err = error as Error & { status?: number };
    res.status(err.status || 500).json({ error: err.message || "Could not restore that version." });
  }
});

projectsRouter.post("/:id/feedback", (req, res) => {
  try {
    const project = saveFeedback(
      req.user!.id,
      String(req.params.id),
      String(req.body?.publishable || ""),
      Array.isArray(req.body?.reasons) ? req.body.reasons.map(String) : []
    );
    res.json({ project });
  } catch (error) {
    const err = error as Error & { status?: number };
    res.status(err.status || 500).json({ error: err.message || "Could not save feedback." });
  }
});

projectsRouter.post("/:id/steps/:step", rateLimit(20, 60_000), async (req, res) => {
  const step = String(req.params.step) as keyof typeof CREDIT_COSTS;
  if (!(step in CREDIT_COSTS)) {
    res.status(400).json({ error: "Unknown step." });
    return;
  }
  try {
    const project = await runStep(req.user!.id, String(req.params.id), step, {
      regenerate: Boolean(req.body?.regenerate),
      sceneId: req.body?.sceneId != null ? Number(req.body.sceneId) : undefined,
      idempotencyKey: String(req.get("Idempotency-Key") || req.body?.idempotencyKey || ""),
      feedbackReason: req.body?.feedbackReason,
      feedbackNote: req.body?.feedbackNote,
      evictOldest: Boolean(req.body?.evictOldest),
    });
    res.json({ project, archive: archiveState(req.user!.id) });
  } catch (error) {
    const err = error as Error & { status?: number; code?: string };
    res.status(err.status || 500).json({ error: err.message || "Generation failed.", code: err.code });
  }
});
