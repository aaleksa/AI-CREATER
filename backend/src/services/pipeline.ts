import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { attemptCost, CREDIT_COSTS, EXTRA_ATTEMPT_MULTIPLIER, MAX_STEP_ATTEMPTS, MAX_REGENERATES_PER_STEP, VISUAL_SCENE_CREDITS, visualMinLive } from "../config.js";
import { getBalance, refundCredits, spendCredits } from "./credits.js";
import {
  generateCaptions,
  generateIdea,
  generateScript,
  generateVisuals,
  generateVoice,
  generateOneVisual,
  type BrandKit,
  type CaptionCue,
  type Idea,
  type Script,
  type Visual,
} from "./ai.js";
import { hasVideoFile, hasVoiceFile, removeVideoFile, removeVoiceFile, renderReel, synthesizeSpeech } from "./media.js";

export const FORMAT_TYPES = ["video", "instagram_reel", "tiktok", "image_post", "advertisement", "social_post"] as const;
export type FormatType = (typeof FORMAT_TYPES)[number];

export const MVP_READY: FormatType[] = ["instagram_reel", "tiktok"];

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
}) {
  const id = uuid();
  db.prepare(
    `INSERT INTO ai_generations
      (id, user_id, project_id, type, provider, model, actual_cost_gbp, credits_used, status, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    params.meta ? JSON.stringify(params.meta) : null
  );
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

export function serializeProject(row: Record<string, unknown>) {
  return {
    id: row.id,
    type: row.type,
    prompt: row.prompt,
    status: row.status,
    currentStep: row.current_step,
    idea: parse(row.idea_json),
    script: parse(row.script_json),
    visuals: parse(row.visuals_json),
    voice: parse(row.voice_json),
    captions: parse(row.captions_json),
    audioUrl: hasVoiceFile(String(row.id)) ? `/projects/${row.id}/audio` : null,
    outputUrl: hasVideoFile(String(row.id)) ? `/projects/${row.id}/file` : row.output_url || null,
    hasVideo: hasVideoFile(String(row.id)),
    creditsUsed: row.credits_used,
    stepAttempts: stepAttemptCounts(String(row.id)),
    maxStepAttempts: MAX_STEP_ATTEMPTS,
    maxRegenerates: MAX_REGENERATES_PER_STEP,
    extraAttemptMultiplier: EXTRA_ATTEMPT_MULTIPLIER,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createProject(userId: string, type: FormatType, prompt: string) {
  const id = uuid();
  db.prepare(
    `INSERT INTO projects (id, user_id, type, prompt, status, current_step)
     VALUES (?, ?, ?, ?, 'draft', 'prompt')`
  ).run(id, userId, type, prompt);
  return getProject(id, userId);
}

export async function runStep(
  userId: string,
  projectId: string,
  step: keyof typeof CREDIT_COSTS,
  opts: { regenerate?: boolean; sceneId?: number } = {}
) {
  const project = getProject(projectId, userId);
  const brand = brandFor(userId);
  const sceneId = Number.isFinite(opts.sceneId) ? Number(opts.sceneId) : undefined;
  if (sceneId && step !== "visuals") {
    throw Object.assign(new Error("Only visuals can regenerate a single frame."), { status: 400 });
  }
  const prompt = String(project.prompt);
  const type = String(project.type);
  const regenerate = Boolean(opts.regenerate);

  const alreadyDone =
    (step === "idea" && Boolean(project.idea_json)) ||
    (step === "script" && Boolean(project.script_json)) ||
    (step === "visuals" && Boolean(project.visuals_json)) ||
    (step === "voice" && hasVoiceFile(projectId)) ||
    (step === "captions" && Boolean(project.captions_json)) ||
    (step === "render" && hasVideoFile(projectId));
  if (alreadyDone && !regenerate) return serializeProject(project);

  const attemptsSoFar = stepAttemptCount(projectId, step);
  const multiplier = attemptsSoFar >= MAX_STEP_ATTEMPTS ? EXTRA_ATTEMPT_MULTIPLIER : 1;
  let cost = attemptCost(step === "visuals" && sceneId ? VISUAL_SCENE_CREDITS : CREDIT_COSTS[step], attemptsSoFar);

  const idea = parse<Idea>(project.idea_json);
  const script = parse<Script>(project.script_json);
  if (step === "script" && !idea) {
    throw Object.assign(new Error("Generate the idea first."), { status: 400 });
  }
  if ((step === "visuals" || step === "voice" || step === "captions" || step === "render") && !script) {
    throw Object.assign(new Error("Generate the script first."), { status: 400 });
  }
  if (step === "visuals" && sceneId && script && !script.scenes.find((item) => item.id === sceneId)) {
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

  const generationId = logGeneration({
    userId,
    projectId,
    type: step,
    provider: "pending",
    model: "pending",
    cost: 0,
    credits: cost,
    status: "running",
  });
  const reserved = cost;
  spendCredits(userId, reserved, `${regenerate ? "regenerate " : ""}${step} for ${type}`, generationId);
  let providerTouched = false;

  try {
    let provider = "auteur-studio";
    let model = "preview";
    let actualCost = 0;
    const updates: Record<string, string | number> = {
      updated_at: new Date().toISOString(),
    };

    if (step === "idea") {
      providerTouched = true;
      const result = await generateIdea(prompt, type, brand);
      updates.idea_json = JSON.stringify(result.data);
      updates.current_step = "idea";
      provider = result.provider;
      model = result.model;
      actualCost = result.cost;
    } else if (step === "script" && idea) {
      providerTouched = true;
      const result = await generateScript(prompt, idea, brand);
      updates.script_json = JSON.stringify(result.data);
      updates.current_step = "script";
      provider = result.provider;
      model = result.model;
      actualCost = result.cost;
    } else if (step === "visuals" && script) {
      providerTouched = true;
      if (sceneId) {
        const scene = script.scenes.find((item) => item.id === sceneId)!;
        const current = parse<Visual[]>(project.visuals_json) || [];
        const one = await generateOneVisual(scene, brand);
        const next = current.some((item) => item.sceneId === sceneId)
          ? current.map((item) => (item.sceneId === sceneId ? one.data : item))
          : [...current, one.data];
        updates.visuals_json = JSON.stringify(next);
        updates.current_step = "visuals";
        provider = one.provider;
        model = one.model;
        actualCost = one.cost;
      } else {
        const result = await generateVisuals(script, brand);
        const minLive = visualMinLive(script.scenes.length);
        if (result.usedOpenAI && result.live < minLive) {
          throw Object.assign(
            new Error(
              `We couldn’t generate enough frames (${result.live} of ${script.scenes.length}). Try a simpler description.`
            ),
            { status: 400 }
          );
        }
        updates.visuals_json = JSON.stringify(result.data);
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

    const fields = Object.keys(updates)
      .map((k) => `${k} = @${k}`)
      .join(", ");
    db.prepare(`UPDATE projects SET ${fields} WHERE id = @id`).run({ ...updates, id: projectId });

    db.prepare(
      `UPDATE ai_generations SET provider = ?, model = ?, actual_cost_gbp = ?, credits_used = ?, status = 'succeeded' WHERE id = ?`
    ).run(provider, model, actualCost, cost, generationId);

    return serializeProject(getProject(projectId, userId));
  } catch (error) {
    db.prepare(`UPDATE ai_generations SET status = 'failed' WHERE id = ?`).run(generationId);
    if (!providerTouched) {
      refundCredits(userId, reserved, `Refund ${step} — AI was not called`);
    } else {
      db.prepare(
        `UPDATE projects SET credits_used = credits_used + ?, updated_at = datetime('now') WHERE id = ?`
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
