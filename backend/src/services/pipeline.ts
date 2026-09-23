import fs from "node:fs";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { attemptCost, config, CREDIT_COSTS, EXTRA_ATTEMPT_MULTIPLIER, IMAGE_SLIDE_COUNT, MAX_STEP_ATTEMPTS, MAX_REGENERATES_PER_STEP, VISUAL_SCENE_CREDITS, visualMinLive } from "../config.js";
import { getBalance, refundCredits, spendCredits } from "./credits.js";
import {
  generateCaptions,
  generateIdea,
  generateScript,
  generateVisuals,
  generateVoice,
  generateOneVisual,
  regenInstruction,
  stillPicturePrompt,
  type BrandKit,
  type CaptionCue,
  type Idea,
  type Script,
  type Visual,
} from "./ai.js";
import { hasStillFile, hasVideoFile, hasVoiceFile, persistStills, removeVideoFile, removeVoiceFile, renderReel, restoreStillSnapshot, snapshotStills, synthesizeSpeech } from "./media.js";
import { inviteFrom, parseInvite, preferBriefInvite } from "./invite.js";
import { parseStepFeedback, recordStepRejection } from "./feedback.js";
import { maybeRefreshLearnedSummary } from "./learning.js";
import { previewState } from "./share.js";

export const FORMAT_TYPES = ["video", "instagram_reel", "tiktok", "image_post", "advertisement", "social_post"] as const;
export type FormatType = (typeof FORMAT_TYPES)[number];

export const MVP_READY: FormatType[] = ["instagram_reel", "tiktok", "image_post"];

export function isImagePost(type: string) {
  return type === "image_post";
}

export const IMAGE_INTENTS = ["photo", "invite", "info", "offer"] as const;
export type ImageIntent = (typeof IMAGE_INTENTS)[number];

export function isInvitePoster(type: string, intent: string) {
  return isImagePost(type) && intent === "invite";
}

export function isTextPoster(type: string, intent: string) {
  return isImagePost(type) && (intent === "invite" || intent === "info" || intent === "offer");
}

export function parseImageIntent(type: string, raw: unknown): ImageIntent | "" {
  if (!isImagePost(type)) return "";
  if (typeof raw === "string" && (IMAGE_INTENTS as readonly string[]).includes(raw)) {
    return raw as ImageIntent;
  }
  return "photo";
}

export function readCreateImageIntent(type: string, raw: unknown): { intent: ImageIntent | "" } | { error: string } {
  if (!isImagePost(type)) return { intent: "" };
  if (raw == null || raw === "") return { intent: "photo" };
  if (typeof raw === "string" && (IMAGE_INTENTS as readonly string[]).includes(raw)) {
    return { intent: raw as ImageIntent };
  }
  return { error: "Choose photo, invitation, information or offer." };
}

function imageCarousel(prompt: string, idea: Idea, intent: ImageIntent | "" = "photo", feedback?: { reason?: string; note?: string }): Script {
  const kind = intent || "photo";
  return {
    durationSec: 0,
    cta: idea.title,
    scenes: [
      {
        id: 1,
        time: "Picture",
        onScreen: "Finished picture",
        voiceover: "",
        visualPrompt: stillPicturePrompt(prompt, idea, "one finished picture from the whole brief", 1, 1, kind, feedback),
      },
    ],
  };
}

function logGeneration(params: {
  userId: string;
  projectId: string;
  type: string;
  provider: string;
  model: string;
  cost: number;
  credits: number;
  status: string;
  meta?: unknown;
  idempotencyKey?: string;
}) {
  const id = uuid();
  const started = new Date().toISOString();
  db.prepare(
    `INSERT INTO ai_generations
      (id, user_id, project_id, type, provider, model, actual_cost_gbp, credits_used, status, meta_json, idempotency_key, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.userId,
    params.projectId,
    params.type,
    params.provider,
    params.model,
    params.cost,
    params.credits,
    params.status,
    params.meta ? JSON.stringify(params.meta) : null,
    params.idempotencyKey || null,
    started
  );
  return { id, started };
}

function finishGeneration(
  id: string,
  started: string,
  fields: { provider: string; model: string; actualCost: number; credits: number; status: string; meta?: unknown }
) {
  const finished = new Date().toISOString();
  db.prepare(
    `UPDATE ai_generations
     SET provider = ?, model = ?, actual_cost_gbp = ?, credits_used = ?, status = ?, meta_json = ?, finished_at = ?, duration_ms = ?
     WHERE id = ?`
  ).run(
    fields.provider,
    fields.model,
    fields.actualCost,
    fields.credits,
    fields.status,
    fields.meta ? JSON.stringify(fields.meta) : null,
    finished,
    Date.now() - Date.parse(started),
    id
  );
}

function saveStepVersion(projectId: string, step: string, payload: unknown, generationId: string, sceneId?: number) {
  const id = uuid();
  if (sceneId) {
    db.prepare("UPDATE project_step_versions SET accepted = 0 WHERE project_id = ? AND step = ? AND scene_id = ?").run(
      projectId,
      step,
      sceneId
    );
  } else {
    db.prepare("UPDATE project_step_versions SET accepted = 0 WHERE project_id = ? AND step = ?").run(projectId, step);
  }
  db.prepare(
    `INSERT INTO project_step_versions (id, project_id, step, scene_id, payload_json, accepted, generation_id)
     VALUES (?, ?, ?, ?, ?, 1, ?)`
  ).run(id, projectId, step, sceneId ?? null, JSON.stringify(payload), generationId);
  return id;
}

function brandFor(userId: string): BrandKit | null {
  return (db.prepare("SELECT * FROM brand_kits WHERE user_id = ?").get(userId) as BrandKit | undefined) ?? null;
}

function getProject(id: string, userId: string) {
  const project = db.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(id, userId) as Record<string, unknown> | undefined;
  if (!project) {
    const err = new Error("Project not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return project;
}

function parse<T>(value: unknown): T | null {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

const STEP_TYPES = ["idea", "script", "visuals", "voice", "captions", "render"] as const;

function stepAttemptCount(projectId: string, step: string) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM ai_generations
       WHERE project_id = ? AND type = ? AND status IN ('succeeded', 'running', 'failed')`
    )
    .get(projectId, step) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

function stepAttemptCounts(projectId: string) {
  const rows = db
    .prepare(
      `SELECT type, COUNT(*) AS n FROM ai_generations
       WHERE project_id = ? AND type IN ('idea', 'script', 'visuals', 'voice', 'captions', 'render')
         AND status IN ('succeeded', 'running', 'failed')
       GROUP BY type`
    )
    .all(projectId) as { type: string; n: number }[];
  const counts = Object.fromEntries(STEP_TYPES.map((step) => [step, 0])) as Record<(typeof STEP_TYPES)[number], number>;
  for (const row of rows) {
    if (row.type in counts) counts[row.type as (typeof STEP_TYPES)[number]] = Number(row.n);
  }
  return counts;
}

function slimVersionPayload(step: string, payload: unknown) {
  if (step !== "visuals" || !Array.isArray(payload)) return payload;
  return payload.map((item) => {
    const visual = item as { imageUrl?: string };
    if (visual.imageUrl && visual.imageUrl.startsWith("data:")) {
      return { ...visual, imageUrl: "" };
    }
    return item;
  });
}

function lastVersions(projectId: string, step: string) {
  const rows = db
    .prepare(
      `SELECT id, payload_json, accepted, created_at FROM project_step_versions
       WHERE project_id = ? AND step = ? ORDER BY created_at ASC`
    )
    .all(projectId, step) as { id: string; payload_json: string; accepted: number; created_at: string }[];
  return rows
    .map((row) => ({
      id: row.id,
      accepted: Number(row.accepted) === 1,
      createdAt: row.created_at,
      payload: slimVersionPayload(step, parse(row.payload_json)),
    }));
}

export function serializeProject(row: Record<string, unknown>) {
  const id = String(row.id);
  const running = db
    .prepare("SELECT type FROM ai_generations WHERE project_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1")
    .get(id) as { type: string } | undefined;
  const feedback = db
    .prepare(
      "SELECT publishable, reasons_json FROM project_feedback WHERE project_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(id) as { publishable: string; reasons_json: string } | undefined;
  return {
    id: row.id,
    type: row.type,
    prompt: row.prompt,
    imageIntent: row.image_intent || "",
    useBrand: Number(row.use_brand) !== 0,
    invite: row.invite_json ? parseInvite(parse(row.invite_json)) : null,
    status: running ? "generating" : row.status,
    currentStep: row.current_step,
    runningStep: running?.type || null,
    idea: parse(row.idea_json),
    script: parse(row.script_json),
    visuals: slimVersionPayload("visuals", parse(row.visuals_json)),
    voice: parse(row.voice_json),
    captions: parse(row.captions_json),
    audioUrl: hasVoiceFile(id) ? `/projects/${id}/audio` : null,
    outputUrl: hasVideoFile(id) ? `/projects/${id}/file` : row.output_url || null,
    hasVideo: hasVideoFile(id),
    hasImages: isImagePost(String(row.type)) && Boolean(parse(row.visuals_json)),
    creditsUsed: row.credits_used,
    stepAttempts: stepAttemptCounts(id),
    maxStepAttempts: MAX_STEP_ATTEMPTS,
    maxRegenerates: MAX_REGENERATES_PER_STEP,
    extraAttemptMultiplier: EXTRA_ATTEMPT_MULTIPLIER,
    feedback: feedback
      ? { publishable: feedback.publishable, reasons: parse<string[]>(feedback.reasons_json) || [] }
      : null,
    versions: {
      idea: lastVersions(id, "idea"),
      script: lastVersions(id, "script"),
      visuals: lastVersions(id, "visuals"),
    },
    ...previewState(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function restoreStepVersion(
  userId: string,
  projectId: string,
  step: "idea" | "script" | "visuals",
  versionId: string,
  sceneId?: number
) {
  const project = getProject(projectId, userId);
  const version = db
    .prepare("SELECT id, payload_json, accepted, scene_id FROM project_step_versions WHERE id = ? AND project_id = ? AND step = ?")
    .get(versionId, projectId, step) as
    | { id: string; payload_json: string; accepted: number; scene_id: number | null }
    | undefined;
  if (!version) throw Object.assign(new Error("That version is gone."), { status: 404 });
  if (Number(version.accepted) === 1 && step !== "visuals") return serializeProject(project);

  if (step === "visuals") {
    const snapshot = parse<Visual[]>(version.payload_json);
    const current = parse<Visual[]>(project.visuals_json) || [];
    if (!snapshot?.length) throw Object.assign(new Error("That picture is gone."), { status: 404 });
    const target = sceneId || version.scene_id;
    const next = target
      ? (() => {
          const frame = snapshot.find((item) => item.sceneId === target);
          if (!frame) throw Object.assign(new Error("That picture is gone."), { status: 404 });
          return current.some((item) => item.sceneId === target)
            ? current.map((item) => (item.sceneId === target ? frame : item))
            : [...current, frame];
        })()
      : snapshot;
    restoreStillSnapshot(projectId, version.id, next, target ? [target] : undefined);
    db.prepare("UPDATE project_step_versions SET accepted = 0 WHERE project_id = ? AND step = 'visuals'").run(projectId);
    db.prepare("UPDATE project_step_versions SET accepted = 1 WHERE id = ?").run(version.id);
    const ready = isImagePost(String(project.type));
    db.prepare(
      `UPDATE projects SET visuals_json = ?, output_url = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(next), ready ? `/projects/${projectId}/image/1` : null, ready ? "ready" : "draft", projectId);
    removeVideoFile(projectId);
    return serializeProject(getProject(projectId, userId));
  }

  if (Number(version.accepted) === 1) return serializeProject(project);
  db.prepare("UPDATE project_step_versions SET accepted = 0 WHERE project_id = ? AND step = ?").run(projectId, step);
  db.prepare("UPDATE project_step_versions SET accepted = 1 WHERE id = ?").run(version.id);
  const field = step === "idea" ? "idea_json" : "script_json";
  const wipe = downstreamWipe(step);
  const updates = {
    [field]: version.payload_json,
    ...wipe,
    updated_at: new Date().toISOString(),
  };
  removeVoiceFile(projectId);
  removeVideoFile(projectId);
  const fields = Object.keys(updates)
    .map((key) => `${key} = @${key}`)
    .join(", ");
  db.prepare(`UPDATE projects SET ${fields} WHERE id = @id`).run({ ...updates, id: projectId });
  return serializeProject(getProject(projectId, userId));
}

function pickIdea(data: Idea & { invite?: unknown }): Idea {
  return {
    title: String(data.title || "").trim(),
    hook: String(data.hook || "").trim(),
    concept: String(data.concept || "").trim(),
    audience: String(data.audience || "").trim(),
    visualDirection: String(data.visualDirection || "").trim(),
  };
}

export async function updateInvite(userId: string, projectId: string, raw: unknown) {
  const project = getProject(projectId, userId);
  const type = String(project.type);
  const imageIntent = parseImageIntent(type, project.image_intent);
  if (!isInvitePoster(type, imageIntent)) {
    throw Object.assign(new Error("This post is not an invitation."), { status: 400 });
  }
  const invite = preferBriefInvite(
    inviteFrom(raw, String(project.prompt), project.invite_json, imageIntent),
    String(project.prompt),
    imageIntent
  );
  db.prepare("UPDATE projects SET invite_json = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(invite), projectId);
  return serializeProject(getProject(projectId, userId));
}

export function saveFeedback(userId: string, projectId: string, publishable: string, reasons: string[]) {
  getProject(projectId, userId);
  if (!["yes", "edits", "no"].includes(publishable)) {
    throw Object.assign(new Error("Tell us if you would publish this Reel."), { status: 400 });
  }
  db.prepare(
    `INSERT INTO project_feedback (id, project_id, user_id, publishable, reasons_json) VALUES (?, ?, ?, ?, ?)`
  ).run(uuid(), projectId, userId, publishable, JSON.stringify(reasons));
  return serializeProject(getProject(projectId, userId));
}

export function createProject(
  userId: string,
  type: FormatType,
  prompt: string,
  imageIntent: ImageIntent | "" = "",
  useBrand = true
) {
  const id = uuid();
  db.prepare(
    `INSERT INTO projects (id, user_id, type, prompt, image_intent, use_brand, status, current_step)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', 'prompt')`
  ).run(id, userId, type, prompt, imageIntent, useBrand ? 1 : 0);
  return getProject(id, userId);
}

export async function runStep(
  userId: string,
  projectId: string,
  step: keyof typeof CREDIT_COSTS,
  opts: {
    regenerate?: boolean;
    sceneId?: number;
    idempotencyKey?: string;
    feedbackReason?: unknown;
    feedbackNote?: unknown;
  } = {}
) {
  const project = getProject(projectId, userId);
  const brand = Number(project.use_brand) === 0 ? null : brandFor(userId);
  const sceneId = Number.isFinite(opts.sceneId) ? Number(opts.sceneId) : undefined;
  if (sceneId && step !== "visuals") {
    throw Object.assign(new Error("Only visuals can regenerate a single frame."), { status: 400 });
  }
  const prompt = String(project.prompt);
  const type = String(project.type);
  const imageIntent = parseImageIntent(type, project.image_intent);
  const regenerate = Boolean(opts.regenerate);

  const alreadyDone =
    (step === "idea" && Boolean(project.idea_json)) ||
    (step === "script" && Boolean(project.script_json)) ||
    (step === "visuals" && Boolean(project.visuals_json)) ||
    (step === "voice" && hasVoiceFile(projectId)) ||
    (step === "captions" && Boolean(project.captions_json)) ||
    (step === "render" && hasVideoFile(projectId));
  if (isImagePost(type) && (step === "script" || step === "voice" || step === "captions" || step === "render")) {
    throw Object.assign(new Error("This is a still post — pictures only, no voice or video."), { status: 400 });
  }
  if (alreadyDone && !regenerate) return serializeProject(project);
  const feedback = regenerate ? parseStepFeedback(step, opts.feedbackReason, opts.feedbackNote) : { reason: "", note: "" };

  const idempotencyKey = String(opts.idempotencyKey || "").trim().slice(0, 80);
  if (idempotencyKey) {
    const prior = db
      .prepare(
        `SELECT status, project_id FROM ai_generations WHERE user_id = ? AND idempotency_key = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(userId, idempotencyKey) as { status: string; project_id: string } | undefined;
    if (prior?.status === "succeeded") return serializeProject(getProject(projectId, userId));
    if (prior?.status === "running") {
      throw Object.assign(new Error("This request is already running."), { status: 409 });
    }
  }
  const inflight = db
    .prepare(`SELECT id FROM ai_generations WHERE project_id = ? AND type = ? AND status = 'running'`)
    .get(projectId, step);
  if (inflight) {
    throw Object.assign(new Error("This step is already running. Wait for it to finish."), { status: 409 });
  }

  const attemptsSoFar = stepAttemptCount(projectId, step);
  const multiplier = attemptsSoFar >= MAX_STEP_ATTEMPTS ? EXTRA_ATTEMPT_MULTIPLIER : 1;
  const visualsBase =
    step === "visuals" && sceneId
      ? VISUAL_SCENE_CREDITS
      : step === "visuals" && isImagePost(type)
        ? IMAGE_SLIDE_COUNT * VISUAL_SCENE_CREDITS
        : CREDIT_COSTS[step];
  let cost = attemptCost(visualsBase, attemptsSoFar);

  const idea = parse<Idea>(project.idea_json);
  const script = parse<Script>(project.script_json);
  if (step === "script" && !idea) {
    throw Object.assign(new Error("Generate the idea first."), { status: 400 });
  }
  if (step === "visuals" && isImagePost(type) && !idea) {
    throw Object.assign(new Error("Generate the idea first."), { status: 400 });
  }
  if (step === "visuals" && !config.openaiKey) {
    throw Object.assign(new Error("Pictures need an OpenAI key. Add OPENAI_API_KEY and restart the API."), { status: 400 });
  }
  if ((step === "visuals" || step === "voice" || step === "captions" || step === "render") && !script && !isImagePost(type)) {
    throw Object.assign(new Error("Generate the script first."), { status: 400 });
  }
  const imageScript = isImagePost(type) && idea ? imageCarousel(prompt, idea, imageIntent, feedback) : script;
  if (step === "visuals" && sceneId && imageScript && !imageScript.scenes.find((item) => item.id === sceneId)) {
    throw Object.assign(new Error("Unknown scene."), { status: 400 });
  }
  if (step === "render" && !hasVoiceFile(projectId)) {
    throw Object.assign(new Error("Generate the voice audio first."), { status: 400 });
  }

  if (getBalance(userId) < cost) {
    const err = new Error("Not enough credits. Buy a pack or upgrade your plan.") as Error & { status: number };
    err.status = 402;
    throw err;
  }

  const logged = logGeneration({
    userId,
    projectId,
    type: step,
    provider: "pending",
    model: "pending",
    cost: 0,
    credits: cost,
    status: "running",
    idempotencyKey: idempotencyKey || undefined,
  });
  const generationId = logged.id;
  const reserved = cost;
  try {
    spendCredits(userId, reserved, `${regenerate ? "regenerate " : ""}${step} for ${type}`, generationId);
  } catch (error) {
    finishGeneration(generationId, logged.started, {
      provider: "pending",
      model: "pending",
      actualCost: 0,
      credits: 0,
      status: "failed",
    });
    throw error;
  }
  if (alreadyDone && regenerate) {
    recordStepRejection({
      projectId,
      step,
      sceneId,
      reason: feedback.reason,
      note: feedback.note,
    });
  }
  db.prepare("UPDATE projects SET status = 'generating', updated_at = datetime('now') WHERE id = ?").run(projectId);
  let providerTouched = false;
  const meta: Record<string, unknown> = { startedAt: logged.started };

  try {
    let provider = "auteur-studio";
    let model = "preview";
    let actualCost = 0;
    const updates: Record<string, string | number> = {
      updated_at: new Date().toISOString(),
    };

    if (step === "idea") {
      providerTouched = true;
      const result = await generateIdea(prompt, type, brand, imageIntent, feedback);
      updates.idea_json = JSON.stringify(pickIdea(result.data));
      if (isInvitePoster(type, imageIntent)) {
        updates.invite_json = JSON.stringify(preferBriefInvite(result.data.invite, prompt, "invite"));
      }
      updates.current_step = "idea";
      provider = result.provider;
      model = result.model;
      actualCost = result.cost;
    } else if (step === "script" && idea) {
      providerTouched = true;
      const result = await generateScript(prompt, idea, brand, feedback);
      updates.script_json = JSON.stringify(result.data);
      updates.current_step = "script";
      provider = result.provider;
      model = result.model;
      actualCost = result.cost;
    } else if (step === "visuals" && imageScript) {
      providerTouched = true;
      const poster = isImagePost(type) && isTextPoster(type, imageIntent || "photo");
      const kind = poster ? "poster" : isImagePost(type) ? "still" : "video";
      const avoid = regenInstruction(feedback);
      if (avoid) {
        for (const scene of imageScript.scenes) {
          if (!scene.visualPrompt.includes(avoid)) scene.visualPrompt = `${scene.visualPrompt} ${avoid}`;
        }
      }
      if (isImagePost(type)) {
        updates.script_json = JSON.stringify(imageScript);
      }
      if (regenerate || sceneId) {
        const currentFrames = parse<Visual[]>(project.visuals_json) || [];
        const currentVersion = db
          .prepare(
            `SELECT id FROM project_step_versions
             WHERE project_id = ? AND step = 'visuals' AND accepted = 1
             ORDER BY created_at DESC LIMIT 1`
          )
          .get(projectId) as { id: string } | undefined;
        if (currentVersion && currentFrames.length) snapshotStills(projectId, currentVersion.id, currentFrames);
      }
      if (sceneId) {
        const scene = imageScript.scenes.find((item) => item.id === sceneId)!;
        const current = parse<Visual[]>(project.visuals_json) || [];
        const one = await generateOneVisual(scene, brand, kind);
        const next = await persistStills(
          projectId,
          current.some((item) => item.sceneId === sceneId)
            ? current.map((item) => (item.sceneId === sceneId ? one.data : item))
            : [...current, one.data]
        );
        updates.visuals_json = JSON.stringify(next);
        updates.current_step = "visuals";
        provider = one.provider;
        model = one.model;
        actualCost = one.cost;
      } else {
        const result = await generateVisuals(imageScript, brand, kind, async (visual) => {
          const [saved] = await persistStills(projectId, [visual]);
          return saved;
        });
        const minLive = visualMinLive(imageScript.scenes.length);
        if (result.usedOpenAI && result.live < minLive) {
          throw Object.assign(
            new Error(
              `We couldn’t generate enough ${isImagePost(type) ? "pictures" : "frames"} (${result.live} of ${imageScript.scenes.length}). Try a simpler description.`
            ),
            { status: 400 }
          );
        }
        const persisted = await persistStills(projectId, result.data);
        updates.visuals_json = JSON.stringify(persisted);
        updates.current_step = "visuals";
        provider = result.provider;
        model = result.model;
        actualCost = result.cost;
        if (result.usedOpenAI) cost = result.live * VISUAL_SCENE_CREDITS * multiplier;
      }
    } else if (step === "voice" && script) {
      providerTouched = true;
      const result = await generateVoice(script, brand);
      const direction = {
        voicePreset: result.data.voicePreset || result.data.voice || "warm_british_female",
        voice: result.data.voice || result.data.voicePreset || "warm british female",
        script: result.data.script,
        notes: result.data.notes,
      };
      updates.voice_json = JSON.stringify(direction);
      const tts = await synthesizeSpeech(direction.script, projectId);
      updates.audio_url = `/projects/${projectId}/audio`;
      updates.current_step = "voice";
      provider = tts.provider;
      model = tts.model;
      actualCost = result.cost + tts.cost;
      logGeneration({
        userId,
        projectId,
        type: "tts",
        provider: tts.provider,
        model: tts.model,
        cost: tts.cost,
        credits: 0,
        status: "succeeded",
      });
    } else if (step === "captions" && script) {
      providerTouched = true;
      const result = await generateCaptions(script);
      updates.captions_json = JSON.stringify(result.data);
      updates.current_step = "captions";
      provider = result.provider;
      model = result.model;
      actualCost = result.cost;
    } else if (step === "render" && script) {
      providerTouched = true;
      const rendered = await renderReel({
        projectId,
        script,
        visuals: parse<Visual[]>(project.visuals_json),
        captions: parse<{ cues: CaptionCue[] }>(project.captions_json),
        primaryColor: brand?.primary_color,
      });
      updates.current_step = "create";
      updates.status = "ready";
      updates.output_url = `/projects/${projectId}/file`;
      provider = rendered.provider;
      model = rendered.model;
      actualCost = rendered.cost;
      meta.queueWaitMs = rendered.queueWaitMs;
      meta.encodeMs = rendered.encodeMs;
    }

    if (cost < reserved) {
      refundCredits(userId, reserved - cost, `Unused ${step} credits after live frames`);
    }

    updates.credits_used = Number(project.credits_used) + cost;

    if (regenerate || sceneId) {
      Object.assign(updates, downstreamWipe(step, Boolean(sceneId)));
      if (step === "idea" || step === "script") removeVoiceFile(projectId);
      if (step !== "render") removeVideoFile(projectId);
    }
    if (step === "render") {
      /* ready already set */
    } else if (isImagePost(type)) {
      updates.status = step === "visuals" ? "ready" : "draft";
      if (step === "visuals") updates.output_url = `/projects/${projectId}/image/1`;
    } else {
      updates.status = hasVideoFile(projectId) ? "ready" : "draft";
    }

    const fields = Object.keys(updates)
      .map((k) => `${k} = @${k}`)
      .join(", ");
    db.prepare(`UPDATE projects SET ${fields} WHERE id = @id`).run({ ...updates, id: projectId });

    finishGeneration(generationId, logged.started, {
      provider,
      model,
      actualCost,
      credits: cost,
      status: "succeeded",
      meta,
    });
    const versionPayload =
      step === "idea"
        ? updates.idea_json
        : step === "script"
          ? updates.script_json
          : step === "visuals"
            ? updates.visuals_json
            : step === "voice"
              ? updates.voice_json
              : step === "captions"
                ? updates.captions_json
                : updates.output_url;
    const versionId = saveStepVersion(
      projectId,
      step,
      versionPayload ? parse(String(versionPayload)) || versionPayload : {},
      generationId,
      sceneId
    );
    if (step === "visuals") {
      const frames = parse<Visual[]>(String(updates.visuals_json || ""));
      if (frames?.length) snapshotStills(projectId, versionId, frames);
    }
    if (String(updates.status || "") === "ready") maybeRefreshLearnedSummary(userId);

    return serializeProject(getProject(projectId, userId));
  } catch (error) {
    finishGeneration(generationId, logged.started, {
      provider: "pending",
      model: "pending",
      actualCost: 0,
      credits: providerTouched ? reserved : 0,
      status: "failed",
      meta,
    });
    if (!providerTouched) {
      refundCredits(userId, reserved, `Refund ${step} — AI was not called`);
      db.prepare(
        `UPDATE projects SET status = CASE WHEN status = 'generating' THEN 'draft' ELSE status END, updated_at = datetime('now') WHERE id = ?`
      ).run(projectId);
    } else {
      db.prepare(
        `UPDATE projects SET credits_used = credits_used + ?, status = CASE WHEN status = 'generating' THEN 'draft' ELSE status END, updated_at = datetime('now') WHERE id = ?`
      ).run(reserved, projectId);
    }
    throw error;
  }
}

function downstreamWipe(step: keyof typeof CREDIT_COSTS, _singleFrame = false): Record<string, string | number | null> {
  if (step === "idea") {
    return {
      script_json: null,
      visuals_json: null,
      voice_json: null,
      captions_json: null,
      audio_url: "",
      output_url: null,
      status: "draft",
    };
  }
  if (step === "script") {
    return {
      visuals_json: null,
      voice_json: null,
      captions_json: null,
      audio_url: "",
      output_url: null,
      status: "draft",
    };
  }
  if (step === "visuals" || step === "captions") {
    return { output_url: null, status: "draft" };
  }
  if (step === "voice") {
    return { captions_json: null, output_url: null, status: "draft" };
  }
  return {};
}
