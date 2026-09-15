import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { CREDIT_COSTS, FULL_VIDEO_COST } from "../config.js";
import { FORMAT_TYPES, MVP_READY, createProject, runStep, serializeProject } from "../services/pipeline.js";
import { hasVideoFile, hasVoiceFile, videoFile, voiceFile } from "../services/media.js";

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
  if (!prompt || String(prompt).trim().length < 8) {
    res.status(400).json({ error: "Tell us what you want to create — a sentence is enough." });
    return;
  }
  if (!MVP_READY.includes(type as (typeof FORMAT_TYPES)[number])) {
    res.status(400).json({
      error: "This format is next. The first studio is Reels and TikTok — 30 seconds, vertical, done for you.",
    });
    return;
  }
  const project = createProject(req.user!.id, type as (typeof FORMAT_TYPES)[number], String(prompt).trim());
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

projectsRouter.post("/:id/steps/:step", async (req, res) => {
  const step = String(req.params.step) as keyof typeof CREDIT_COSTS;
  if (!(step in CREDIT_COSTS)) {
    res.status(400).json({ error: "Unknown step." });
    return;
  }
  try {
    const project = await runStep(req.user!.id, String(req.params.id), step);
    res.json({ project });
  } catch (error) {
    const err = error as Error & { status?: number };
    res.status(err.status || 500).json({ error: err.message || "Generation failed." });
  }
});
