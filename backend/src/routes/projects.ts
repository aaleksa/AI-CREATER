import express, { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { CREDIT_COSTS, FULL_IMAGE_COST, FULL_INVITE_COST, FULL_VIDEO_COST, MAX_PROMPT_CHARS, MIN_PROMPT_CHARS } from "../config.js";
import { FORMAT_TYPES, MVP_READY, createProject, deletePictureVersion, keepOnlyCurrentPicture, logoBaseFile, logoLayout, logoMarkFile, readCreateImageFormat, readCreateImageIntent, readCreatePictureLanguage, removeLogoFromPicture, restoreStepVersion, runStep, saveFeedback, serializeProject, editCaptions, editScript, translateReelScript, setMusic, updateMusic, removeMusic, updateReelLogo, updateCaptionStyle, updateReelTitles, refreshReelVideo, forkReel, setVoiceChoice, setCaptionsOff, setVoiceOff, stampLogoOnPicture, updateInvite, updateShot, updateCertificate, certificateFile, translateCertificate, setCertificateLogo, removeCertificateLogo, createOwnPicture, reshapeOwnPicture, previewReshape, printOwnPicture, certificateFromPicture, certificateFromUpload } from "../services/pipeline.js";
import { createPreviewLink, findPreview, serializePreview } from "../services/share.js";
import { voiceSampleFile, voiceChoiceOf, VOICE_CHOICES, hasMusicFile, hasStillFile, hasStillVersionFile, hasVideoFile, hasVoiceFile, MUSIC_MAX_BYTES, musicFile, removeProjectMedia, stillFile, stillVersionFile, videoFile, voiceFile } from "../services/media.js";
import { archiveState } from "../services/archive.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { publicError, USER_ERRORS } from "../services/userErrors.js";
import { OWN_PICTURE_MAX } from "../services/ownPicture.js";
import { addExampleRef, exampleRefFile, exampleRefList, readExampleUpload, removeExampleRef } from "../services/projectRefs.js";

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
    res.status(400).json({ error: USER_ERRORS.refresh });
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
  const language = readCreatePictureLanguage(type, intent.intent, req.body?.pictureLanguage);
  if ("error" in language) {
    res.status(400).json({ error: language.error });
    return;
  }
  const shape = readCreateImageFormat(type, intent.intent, req.body?.imageFormat);
  if ("error" in shape) {
    res.status(400).json({ error: shape.error });
    return;
  }
  const useBrand = req.body?.useBrand !== false && req.body?.useBrand !== 0;
  const project = createProject(
    req.user!.id,
    type as (typeof FORMAT_TYPES)[number],
    parsed.text,
    intent.intent,
    useBrand,
    language.language,
    shape.format
  );
  res.status(201).json({ project: serializeProject(project) });
});

/** "Your own picture": a file from the owner's device (body = the image bytes). */
projectsRouter.post(
  "/own",
  rateLimit(20, 60_000),
  express.raw({ type: () => true, limit: OWN_PICTURE_MAX + 1024 }),
  async (req, res) => {
    try {
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      let name = "";
      try {
        name = decodeURIComponent(String(req.get("X-File-Name") || ""));
      } catch {
        name = "";
      }
      const project = await createOwnPicture(req.user!.id, { upload: buf }, req.get("X-Use-Brand"), name);
      res.status(201).json({ project });
    } catch (error) {
      const { status, body } = publicError(error, `${req.method} ${req.path}`);
      res.status(status).json(body);
    }
  }
);

/** Create → Certificate → your own design: the file becomes the certificate's design (cut or fitted to A5). */
projectsRouter.post(
  "/certificate-design",
  rateLimit(20, 60_000),
  express.raw({ type: () => true, limit: OWN_PICTURE_MAX + 1024 }),
  async (req, res) => {
    try {
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      let name = "";
      try {
        name = decodeURIComponent(String(req.get("X-File-Name") || ""));
      } catch {
        name = "";
      }
      const project = await certificateFromUpload(req.user!.id, buf, req.get("X-Use-Brand"), name, {
        mode: req.get("X-Mode"),
        background: req.get("X-Background"),
        lang: String(req.get("Accept-Language") || "").startsWith("uk") ? "uk" : "en",
      });
      res.status(201).json({ project });
    } catch (error) {
      const { status, body } = publicError(error, `${req.method} ${req.path}`);
      res.status(status).json(body);
    }
  }
);

/** "Your own picture" from a picture made in another of the owner's projects (copied; that project stays as it is). */
projectsRouter.post("/own/from/:sourceId", rateLimit(20, 60_000), async (req, res) => {
  try {
    const project = await createOwnPicture(
      req.user!.id,
      { fromProject: String(req.params.sourceId), versionId: req.body?.versionId, certificateIndex: req.body?.index },
      req.body?.useBrand,
      ""
    );
    res.status(201).json({ project });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

function ownProject(req: { params: Record<string, unknown>; user?: { id: string } }) {
  return db
    .prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
    .get(String(req.params.id), req.user!.id) as { id: string } | undefined;
}

projectsRouter.get("/voice-samples/:voice", rateLimit(30, 60_000), async (req, res) => {
  const voice = String(req.params.voice);
  if (!(VOICE_CHOICES as readonly string[]).includes(voice)) {
    res.status(404).json({ error: "No such voice." });
    return;
  }
  try {
    const file = await voiceSampleFile(voiceChoiceOf(voice), req.query.lang === "en" ? "en" : "uk");
    if (!file) throw new Error("no sample");
    res.type("audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.sendFile(file);
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.get("/:id/refs/:slot", (req, res) => {
  const row = ownProject(req);
  const ref = row ? exampleRefFile(row.id, String(req.params.slot)) : null;
  if (!ref) {
    res.status(404).json({ error: "No picture." });
    return;
  }
  res.type(ref.type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(ref.file);
});

projectsRouter.post("/:id/refs", rateLimit(30, 60_000), (req, res) => {
  const row = ownProject(req);
  if (!row) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  const upload = readExampleUpload(req.body?.image);
  if ("error" in upload) {
    res.status(400).json({ error: upload.error });
    return;
  }
  try {
    addExampleRef(row.id, upload.buffer, upload.kind);
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
    return;
  }
  res.json({ refs: exampleRefList(row.id) });
});

projectsRouter.delete("/:id/refs/:slot", (req, res) => {
  const row = ownProject(req);
  if (!row) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  removeExampleRef(row.id, String(req.params.slot));
  res.json({ refs: exampleRefList(row.id) });
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
  res.set("Cache-Control", "no-store");
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
  res.set("Cache-Control", "no-store");
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

projectsRouter.get("/:id/music", (req, res) => {
  const id = String(req.params.id);
  const row = db.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?").get(id, req.user!.id);
  if (!row || !hasMusicFile(id)) {
    res.status(404).json({ error: "No music." });
    return;
  }
  res.type("audio/mp4");
  res.sendFile(musicFile(id));
});

projectsRouter.post(
  "/:id/music",
  rateLimit(10, 60_000),
  express.raw({ type: () => true, limit: MUSIC_MAX_BYTES }),
  async (req, res) => {
    try {
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      let name = "";
      try {
        name = decodeURIComponent(String(req.get("X-File-Name") || ""));
      } catch {
        name = "";
      }
      res.json({ project: await setMusic(req.user!.id, String(req.params.id), buf, name) });
    } catch (error) {
      const { status, body } = publicError(error, `${req.method} ${req.path}`);
      res.status(status).json(body);
    }
  }
);

projectsRouter.patch("/:id/music", rateLimit(30, 60_000), async (req, res) => {
  try {
    res.json({ project: await updateMusic(req.user!.id, String(req.params.id), req.body) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.delete("/:id/music", rateLimit(30, 60_000), async (req, res) => {
  try {
    res.json({ project: await removeMusic(req.user!.id, String(req.params.id)) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
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

projectsRouter.patch("/:id/certificate", (req, res) => {
  try {
    res.json({ project: updateCertificate(req.user!.id, String(req.params.id), req.body) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post(
  "/:id/certificate/logo",
  rateLimit(20, 60_000),
  express.raw({ type: () => true, limit: 2 * 1024 * 1024 + 1024 }),
  (req, res) => {
    try {
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      res.json({ project: setCertificateLogo(req.user!.id, String(req.params.id), buf) });
    } catch (error) {
      const { status, body } = publicError(error, `${req.method} ${req.path}`);
      res.status(status).json(body);
    }
  }
);

projectsRouter.delete("/:id/certificate/logo", rateLimit(20, 60_000), (req, res) => {
  try {
    res.json({ project: removeCertificateLogo(req.user!.id, String(req.params.id)) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/reshape", rateLimit(20, 60_000), async (req, res) => {
  try {
    res.json({ project: await reshapeOwnPicture(req.user!.id, String(req.params.id), req.body) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/reshape/preview", rateLimit(60, 60_000), async (req, res) => {
  try {
    const jpeg = await previewReshape(req.user!.id, String(req.params.id), req.body);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(jpeg);
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.get("/:id/print", rateLimit(30, 60_000), async (req, res) => {
  try {
    const file = await printOwnPicture(req.user!.id, String(req.params.id), req.query.paper, req.query.fill);
    const safe = file.name.replace(/[^\p{L}\p{N}-]+/gu, "-").slice(0, 60) || "picture";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="picture.pdf"; filename*=UTF-8''${encodeURIComponent(safe)}.pdf`);
    res.send(file.body);
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/make-certificate", rateLimit(10, 60_000), async (req, res) => {
  try {
    const lang = String(req.get("Accept-Language") || "").startsWith("uk") ? "uk" : "en";
    res.status(201).json({ project: await certificateFromPicture(req.user!.id, String(req.params.id), { ...(req.body || {}), lang }) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/certificate/translate", rateLimit(10, 60_000), async (req, res) => {
  try {
    res.json({ project: await translateCertificate(req.user!.id, String(req.params.id), req.body?.lang) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.get("/:id/certificate/:index", rateLimit(60, 60_000), async (req, res) => {
  const format = req.query.format === "pdf" ? "pdf" : req.query.format === "preview" ? "preview" : "png";
  try {
    const file = await certificateFile(req.user!.id, String(req.params.id), Number(req.params.index) || 0, format);
    const safe = file.name.replace(/[^\p{L}\p{N}-]+/gu, "-").slice(0, 60) || "certificate";
    res.setHeader("Content-Type", file.mime);
    res.setHeader("Cache-Control", "no-store");
    if (format !== "preview") {
      res.setHeader("Content-Disposition", `attachment; filename="certificate.${format}"; filename*=UTF-8''${encodeURIComponent(safe)}.${format}`);
    }
    res.send(file.body);
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.patch("/:id/invite", async (req, res) => {
  try {
    const project = await updateInvite(req.user!.id, String(req.params.id), req.body?.invite ?? req.body);
    res.json({ project });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
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
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/versions/:step/:versionId/restore", async (req, res) => {
  const step = String(req.params.step);
  if (step !== "idea" && step !== "script" && step !== "visuals") {
    res.status(400).json({ error: USER_ERRORS.refresh });
    return;
  }
  const sceneRaw = req.body?.sceneId;
  const sceneId = Number.isFinite(Number(sceneRaw)) ? Number(sceneRaw) : undefined;
  try {
    const project = await restoreStepVersion(req.user!.id, String(req.params.id), step, String(req.params.versionId), sceneId);
    res.json({ project });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/logo", rateLimit(20, 60_000), async (req, res) => {
  const sceneId = Number(req.body?.sceneId) || 1;
  try {
    const project = await stampLogoOnPicture(
      req.user!.id,
      String(req.params.id),
      sceneId,
      String(req.body?.position || ""),
      String(req.body?.versionId || "").slice(0, 80),
      req.body?.box
    );
    res.json({ project });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.get("/:id/logo/layout", (req, res) => {
  try {
    res.json(logoLayout(req.user!.id, String(req.params.id), Number(req.query.sceneId) || 1));
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.get("/:id/logo/mark", (req, res) => {
  const file = logoMarkFile(req.user!.id);
  if (!file) {
    res.status(404).json({ error: "Add a logo in Brand Kit first." });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.type(/\.jpe?g$/i.test(file) ? "image/jpeg" : "image/png");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(file);
});

projectsRouter.get("/:id/logo/base", (req, res) => {
  try {
    const file = logoBaseFile(req.user!.id, String(req.params.id), Number(req.query.sceneId) || 1);
    if (!file) {
      res.status(404).json({ error: "Image not ready." });
      return;
    }
    res.set("Cache-Control", "no-store");
    res.type("image/jpeg");
    res.sendFile(file);
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.delete("/:id/logo", rateLimit(20, 60_000), async (req, res) => {
  const sceneId = Number(req.body?.sceneId ?? req.query.sceneId) || 1;
  try {
    const project = await removeLogoFromPicture(req.user!.id, String(req.params.id), sceneId, String(req.query.versionId || "").slice(0, 80));
    res.json({ project });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.delete("/:id/versions/visuals/:versionId", rateLimit(30, 60_000), (req, res) => {
  try {
    res.json({ project: deletePictureVersion(req.user!.id, String(req.params.id), String(req.params.versionId)) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/versions/visuals/keep-current", rateLimit(10, 60_000), (req, res) => {
  try {
    res.json({ project: keepOnlyCurrentPicture(req.user!.id, String(req.params.id)) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.patch("/:id/script", async (req, res) => {
  try {
    res.json({ project: await editScript(req.user!.id, String(req.params.id), req.body) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/script/translate", rateLimit(10, 60_000), async (req, res) => {
  try {
    res.json({ project: await translateReelScript(req.user!.id, String(req.params.id), req.body?.lang) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.patch("/:id/captions", rateLimit(10, 60_000), async (req, res) => {
  try {
    res.json({ project: await editCaptions(req.user!.id, String(req.params.id), req.body) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/fork", rateLimit(10, 60_000), (req, res) => {
  try {
    res.json({ project: forkReel(req.user!.id, String(req.params.id), req.body?.step, String(req.body?.versionId || "")) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/remake", rateLimit(6, 60_000), async (req, res) => {
  try {
    res.json({ project: await refreshReelVideo(req.user!.id, String(req.params.id)) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.patch("/:id/voice-choice", rateLimit(30, 60_000), (req, res) => {
  try {
    res.json({ project: setVoiceChoice(req.user!.id, String(req.params.id), req.body?.voice) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.patch("/:id/captions-style", rateLimit(10, 60_000), async (req, res) => {
  try {
    res.json({ project: await updateCaptionStyle(req.user!.id, String(req.params.id), req.body) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.patch("/:id/titles", rateLimit(10, 60_000), async (req, res) => {
  try {
    res.json({ project: await updateReelTitles(req.user!.id, String(req.params.id), req.body) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.patch("/:id/reel-logo", rateLimit(10, 60_000), async (req, res) => {
  try {
    res.json({ project: await updateReelLogo(req.user!.id, String(req.params.id), req.body) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/captions-off", rateLimit(10, 60_000), async (req, res) => {
  try {
    res.json({ project: await setCaptionsOff(req.user!.id, String(req.params.id), req.body?.off !== false) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/voice-off", rateLimit(10, 60_000), async (req, res) => {
  try {
    res.json({ project: await setVoiceOff(req.user!.id, String(req.params.id), req.body?.off !== false) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
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
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/shot", rateLimit(30, 60_000), (req, res) => {
  try {
    const project = updateShot(req.user!.id, String(req.params.id), {
      confirm: req.body?.confirm,
      shot: req.body?.shot,
    });
    res.json({ project });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});

projectsRouter.post("/:id/steps/:step", rateLimit(20, 60_000), async (req, res) => {
  const step = String(req.params.step) as keyof typeof CREDIT_COSTS;
  if (!(step in CREDIT_COSTS)) {
    res.status(400).json({ error: USER_ERRORS.refresh });
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
      pictureLanguage: req.body?.pictureLanguage,
      keepStill: Boolean(req.body?.keepStill),
      keepStillVersionId: req.body?.keepStillVersionId,
      copyEdit: req.body?.copyEdit,
      copyEditImage: req.body?.copyEditImage,
      reformat: req.body?.reformat,
      uiLanguage: /^uk\b/i.test(String(req.get("Accept-Language") || "")) ? "uk" : "en",
    });
    res.json({ project, archive: archiveState(req.user!.id) });
  } catch (error) {
    const { status, body } = publicError(error, `${req.method} ${req.path}`);
    res.status(status).json(body);
  }
});
