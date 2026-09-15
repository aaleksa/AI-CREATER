import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { CREDIT_COSTS, FULL_VIDEO_COST, MAX_PROMPT_CHARS, MIN_PROMPT_CHARS } from "../config.js";
import { FORMAT_TYPES, MVP_READY, createProject, runStep, serializeProject } from "../services/pipeline.js";
import { hasVideoFile, hasVoiceFile, videoFile, voiceFile } from "../services/media.js";

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
  res.json({ projects: rows.map(serializeProject), costs: CREDIT_COSTS, fullVideoCost: FULL_VIDEO_COST });
});

projectsRouter.post("/", (req, res) => {
  const { type, prompt } = req.body ?? {};
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
      error: "This format is next. The first studio is Reels and TikTok — 30 seconds, vertical, done for you.",
    });
    return;
  }
  const project = createProject(req.user!.id, type as (typeof FORMAT_TYPES)[number], parsed.text);
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

projectsRouter.get("/:id", (req, res) => {
  const id = String(req.params.id);
  const row = db
    .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
    .get(id, req.user!.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  res.json({ project: serializeProject(row), costs: CREDIT_COSTS, fullVideoCost: FULL_VIDEO_COST });
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
  const next = db.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(id, req.user!.id) as Record<string, unknown>;
  res.json({ project: serializeProject(next) });
});

projectsRouter.post("/:id/steps/:step", async (req, res) => {
  const step = String(req.params.step) as keyof typeof CREDIT_COSTS;
  if (!(step in CREDIT_COSTS)) {
    res.status(400).json({ error: "Unknown step." });
    return;
  }
  try {
    const project = await runStep(req.user!.id, String(req.params.id), step, {
      regenerate: Boolean(req.body?.regenerate),
      sceneId: req.body?.sceneId != null ? Number(req.body.sceneId) : undefined,
    });
    res.json({ project });
  } catch (error) {
    const err = error as Error & { status?: number };
    res.status(err.status || 500).json({ error: err.message || "Generation failed." });
  }
});
