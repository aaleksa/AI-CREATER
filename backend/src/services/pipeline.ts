import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { CREDIT_COSTS } from "../config.js";
import { getBalance, spendCredits } from "./credits.js";
import {
  generateCaptions,
  generateIdea,
  generateScript,
  generateVisuals,
  generateVoice,
  type BrandKit,
  type Idea,
  type Script,
} from "./ai.js";

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
    outputUrl: row.output_url,
    creditsUsed: row.credits_used,
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

export async function runStep(userId: string, projectId: string, step: keyof typeof CREDIT_COSTS) {
  const project = getProject(projectId, userId);
  const brand = brandFor(userId);
  const cost = CREDIT_COSTS[step];
  const prompt = String(project.prompt);
  const type = String(project.type);

  const alreadyDone =
    (step === "idea" && Boolean(project.idea_json)) ||
    (step === "script" && Boolean(project.script_json)) ||
    (step === "visuals" && Boolean(project.visuals_json)) ||
    (step === "voice" && Boolean(project.voice_json)) ||
    (step === "captions" && Boolean(project.captions_json)) ||
    (step === "render" && project.status === "ready");
  if (alreadyDone) return serializeProject(project);

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

  try {
    let provider = "auteur-studio";
    let model = "preview";
    let actualCost = 0;
    const updates: Record<string, string | number> = {
      updated_at: new Date().toISOString(),
    };

    if (step === "idea") {
      const result = await generateIdea(prompt, type, brand);
      updates.idea_json = JSON.stringify(result.data);
      updates.current_step = "idea";
      provider = result.provider;
      model = result.model;
      actualCost = result.cost;
    } else if (step === "script") {
      const idea = parse<Idea>(project.idea_json);
      if (!idea) throw Object.assign(new Error("Generate the idea first."), { status: 400 });
      const result = await generateScript(prompt, idea, brand);
      updates.script_json = JSON.stringify(result.data);
      updates.current_step = "script";
      provider = result.provider;
      model = result.model;
      actualCost = result.cost;
    } else if (step === "visuals") {
      const script = parse<Script>(project.script_json);
      if (!script) throw Object.assign(new Error("Generate the script first."), { status: 400 });
      const result = await generateVisuals(script, brand);
      updates.visuals_json = JSON.stringify(result.data);
      updates.current_step = "visuals";
      provider = result.provider;
      model = result.model;
      actualCost = result.cost;
    } else if (step === "voice") {
      const script = parse<Script>(project.script_json);
      if (!script) throw Object.assign(new Error("Generate the script first."), { status: 400 });
      const result = await generateVoice(script, brand);
      updates.voice_json = JSON.stringify(result.data);
      updates.current_step = "voice";
      provider = result.provider;
      model = result.model;
      actualCost = result.cost;
    } else if (step === "captions") {
      const script = parse<Script>(project.script_json);
      if (!script) throw Object.assign(new Error("Generate the script first."), { status: 400 });
      const result = await generateCaptions(script);
      updates.captions_json = JSON.stringify(result.data);
      updates.current_step = "captions";
      provider = result.provider;
      model = result.model;
      actualCost = result.cost;
    } else if (step === "render") {
      updates.current_step = "create";
      updates.status = "ready";
      updates.output_url = `/projects/${projectId}/preview`;
      provider = "auteur-renderer";
      model = "vertical-30s";
      actualCost = 0.01;
    }

    spendCredits(userId, cost, `${step} for ${type}`, generationId);
    const used = Number(project.credits_used) + cost;
    updates.credits_used = used;

    const fields = Object.keys(updates)
      .map((k) => `${k} = @${k}`)
      .join(", ");
    db.prepare(`UPDATE projects SET ${fields} WHERE id = @id`).run({ ...updates, id: projectId });

    db.prepare(
      `UPDATE ai_generations SET provider = ?, model = ?, actual_cost_gbp = ?, status = 'succeeded' WHERE id = ?`
    ).run(provider, model, actualCost, generationId);

    return serializeProject(getProject(projectId, userId));
  } catch (error) {
    db.prepare(`UPDATE ai_generations SET status = 'failed' WHERE id = ?`).run(generationId);
    throw error;
  }
}
