import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

/**
 * Optional: paint pictures with a ComfyUI you run yourself (local use).
 * Off unless COMFYUI_URL is set, so a hosted server (no ComfyUI next to it) always uses OpenAI.
 * Any failure returns null; the caller shows an error (or falls back to OpenAI if COMFYUI_FALLBACK=openai).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const comfyDir = path.resolve(here, "../../comfy");

export function comfyUrl() {
  return (process.env.COMFYUI_URL || "").trim().replace(/\/+$/, "");
}

export function comfyEnabled() {
  return Boolean(comfyUrl());
}

/** Off by default: with COMFYUI_URL set, ComfyUI is the painter and a failure is shown, not quietly sent (and billed) to OpenAI. */
export function comfyFallsBackToOpenAI() {
  return /^(openai|1|true|yes)$/i.test((process.env.COMFYUI_FALLBACK || "").trim());
}

export const COMFY_FAILED_MESSAGE =
  "ComfyUI did not make the picture. Start ComfyUI and try again, or remove COMFYUI_URL from backend/.env to use OpenAI.";

/** Which kinds of picture go to ComfyUI. Designed flyers with words stay on OpenAI: Stable Diffusion cannot spell. */
export function comfyHandles(kind: "video" | "still" | "poster") {
  const allowed = (process.env.COMFYUI_KINDS || "still,video")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(kind);
}

function workflowPath() {
  const custom = (process.env.COMFYUI_WORKFLOW || "").trim();
  if (custom) return path.isAbsolute(custom) ? custom : path.resolve(comfyDir, "..", custom);
  const own = path.join(comfyDir, "workflow.json");
  return fs.existsSync(own) ? own : path.join(comfyDir, "workflow.example.json");
}

type Vars = { prompt: string; negative: string; width: number; height: number; seed: number; checkpoint: string; steps: number; cfg: number };

/** Replaces {{prompt}}, {{negative}}, {{checkpoint}}, {{width}}, {{height}}, {{seed}}, {{steps}}, {{cfg}} anywhere in the workflow. */
function fill(node: unknown, vars: Vars): unknown {
  if (typeof node === "string") {
    const whole = node.match(/^\{\{(width|height|seed|steps|cfg)\}\}$/);
    if (whole) return vars[whole[1] as "width" | "height" | "seed" | "steps" | "cfg"];
    return node
      .replaceAll("{{prompt}}", vars.prompt)
      .replaceAll("{{negative}}", vars.negative)
      .replaceAll("{{checkpoint}}", vars.checkpoint);
  }
  if (Array.isArray(node)) return node.map((item) => fill(item, vars));
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, fill(v, vars)]));
  }
  return node;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url: string, ms = 5000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`ComfyUI ${res.status}`);
  return res.json() as Promise<Record<string, any>>;
}

/** Paints one picture. Returns a data URL, or null when ComfyUI is unreachable or the workflow fails. */
export async function comfyPaint(params: { prompt: string; width: number; height: number }) {
  const base = comfyUrl();
  if (!base) return null;
  const started = Date.now();
  try {
    // Quick reachability check so a closed ComfyUI does not slow every picture down.
    await getJson(`${base}/system_stats`, 1500);

    const maxSide = Number(process.env.COMFYUI_MAX_SIDE) || 0;
    const scale = maxSide ? Math.min(1, maxSide / Math.max(params.width, params.height)) : 1;
    const round8 = (n: number) => Math.max(64, Math.round((n * scale) / 8) * 8);
    const vars: Vars = {
      prompt: params.prompt.slice(0, Number(process.env.COMFYUI_PROMPT_CHARS) || 900),
      negative:
        process.env.COMFYUI_NEGATIVE ||
        "text, letters, watermark, logo, blurry, low quality, deformed, extra fingers, cartoon",
      checkpoint: process.env.COMFYUI_CHECKPOINT || "",
      width: round8(params.width),
      height: round8(params.height),
      seed: Math.floor(Math.random() * 2 ** 31),
      steps: Number(process.env.COMFYUI_STEPS) || 25,
      cfg: Number(process.env.COMFYUI_CFG) || 7,
    };
    const workflow = fill(JSON.parse(fs.readFileSync(workflowPath(), "utf8")), vars);

    const submit = await fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
      signal: AbortSignal.timeout(10_000),
    });
    const submitted = (await submit.json().catch(() => ({}))) as { prompt_id?: string; error?: unknown; node_errors?: unknown };
    if (!submit.ok || !submitted.prompt_id) {
      throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(submitted.error || submitted.node_errors || submit.status).slice(0, 400)}`);
    }

    const limit = Number(process.env.COMFYUI_TIMEOUT_MS) || 300_000;
    while (Date.now() - started < limit) {
      await sleep(1000);
      const history = await getJson(`${base}/history/${submitted.prompt_id}`);
      const entry = history[submitted.prompt_id];
      if (!entry) continue;
      const failed = entry.status?.status_str === "error";
      if (failed) throw new Error("ComfyUI reported an error while painting. Check its console.");
      const outputs = Object.values(entry.outputs || {}) as { images?: { filename: string; subfolder: string; type: string }[] }[];
      const file = outputs.flatMap((o) => o.images || [])[0];
      if (!file) continue;
      const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder || "", type: file.type || "output" });
      const image = await fetch(`${base}/view?${query}`, { signal: AbortSignal.timeout(20_000) });
      if (!image.ok) throw new Error(`ComfyUI could not return the picture (${image.status})`);
      const bytes = Buffer.from(await image.arrayBuffer());
      if (!bytes.length) throw new Error("ComfyUI returned an empty picture");
      return `data:image/png;base64,${bytes.toString("base64")}`;
    }
    // Stop the job so it does not keep the GPU busy after we have given up.
    await fetch(`${base}/interrupt`, { method: "POST", signal: AbortSignal.timeout(3000) }).catch(() => {});
    throw new Error(`ComfyUI took longer than ${Math.round(limit / 1000)}s (try a smaller COMFYUI_MAX_SIDE or fewer COMFYUI_STEPS)`);
  } catch (error) {
    console.error("ComfyUI failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
