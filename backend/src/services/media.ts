import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { config } from "../config.js";
import type { CaptionCue, Script, Visual } from "./ai.js";

const require = createRequire(import.meta.url);
const ffmpegPath = (require("ffmpeg-static") as string | null) || "ffmpeg";

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data");

export function brandLogoDir(userId: string) {
  const dir = path.join(dataDir, "media", "brand", userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function brandLogoPath(userId: string) {
  const dir = path.join(dataDir, "media", "brand", userId);
  if (!fs.existsSync(dir)) return "";
  const found = fs.readdirSync(dir).find((name) => /^logo\.(png|jpe?g|webp)$/i.test(name));
  return found ? path.join(dir, found) : "";
}

export function brandLogoType(userId: string) {
  const file = brandLogoPath(userId);
  if (!file) return null;
  const ext = path.extname(file).toLowerCase();
  const type =
    ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "";
  if (!type) return null;
  return { file, type };
}

export function logoKindFromBytes(buffer: Buffer): "png" | "jpg" | "" {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  return "";
}

export function hasBrandLogo(userId: string) {
  const file = brandLogoPath(userId);
  return Boolean(file && fs.existsSync(file) && fs.statSync(file).size > 0);
}

export function removeBrandLogo(userId: string) {
  const dir = path.join(dataDir, "media", "brand", userId);
  fs.rmSync(dir, { recursive: true, force: true });
}

export function writeBrandLogo(userId: string, buffer: Buffer, ext: string) {
  const safe = ext === "png" || ext === "jpg" || ext === "jpeg" ? (ext === "jpeg" ? "jpg" : ext) : "";
  if (!safe) throw Object.assign(new Error("Use a PNG or JPG under 2 MB. SVG is not allowed."), { status: 400 });
  const dir = brandLogoDir(userId);
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith("logo.")) fs.rmSync(path.join(dir, name), { force: true });
  }
  const file = path.join(dir, `logo.${safe}`);
  fs.writeFileSync(file, buffer);
  return file;
}

export function projectMediaDir(projectId: string) {
  const dir = path.join(dataDir, "media", projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function projectMediaPath(projectId: string) {
  return path.join(dataDir, "media", projectId);
}

export function voiceFile(projectId: string) {
  return path.join(projectMediaDir(projectId), "voice.mp3");
}

export function videoFile(projectId: string) {
  return path.join(projectMediaDir(projectId), "reel.mp4");
}

export function stillFile(projectId: string, sceneId: number) {
  return path.join(projectMediaDir(projectId), `still-${sceneId}.jpg`);
}

export function stillBgFile(projectId: string) {
  return path.join(projectMediaDir(projectId), "still-bg.jpg");
}

export function stillVersionFile(projectId: string, sceneId: number, versionId: string) {
  return path.join(projectMediaDir(projectId), `still-${sceneId}-${versionId}.jpg`);
}

export function snapshotStills(projectId: string, versionId: string, visuals: Visual[]) {
  for (const visual of visuals) {
    if (!hasStillFile(projectId, visual.sceneId)) continue;
    fs.copyFileSync(stillFile(projectId, visual.sceneId), stillVersionFile(projectId, visual.sceneId, versionId));
  }
}

export function restoreStillSnapshot(projectId: string, versionId: string, visuals: Visual[], sceneIds?: number[]) {
  const targets = sceneIds?.length ? visuals.filter((item) => sceneIds.includes(item.sceneId)) : visuals;
  for (const visual of targets) {
    const snap = stillVersionFile(projectId, visual.sceneId, versionId);
    if (fs.existsSync(snap) && fs.statSync(snap).size > 0) {
      fs.copyFileSync(snap, stillFile(projectId, visual.sceneId));
    }
  }
}

export function hasStillFile(projectId: string, sceneId: number) {
  const file = stillFile(projectId, sceneId);
  return fs.existsSync(file) && fs.statSync(file).size > 0;
}

export function hasStillVersionFile(projectId: string, sceneId: number, versionId: string) {
  const file = stillVersionFile(projectId, sceneId, versionId);
  return fs.existsSync(file) && fs.statSync(file).size > 0;
}

export function hasStillFiles(projectId: string) {
  const dir = projectMediaPath(projectId);
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some((name) => name.startsWith("still-") && fs.statSync(path.join(dir, name)).size > 0);
}

export function removeStillFiles(projectId: string) {
  const dir = projectMediaPath(projectId);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith("still-")) fs.rmSync(path.join(dir, name), { force: true });
  }
}

export async function persistStills(projectId: string, visuals: Visual[]) {
  const next: Visual[] = [];
  for (const visual of visuals) {
    if (visual.placeholder) {
      next.push(visual);
      continue;
    }
    if (visual.imageUrl.startsWith("data:image/")) {
      const comma = visual.imageUrl.indexOf(",");
      const buffer = Buffer.from(visual.imageUrl.slice(comma + 1), "base64");
      if (buffer.length > 0) {
        fs.writeFileSync(stillFile(projectId, visual.sceneId), buffer);
        next.push({ ...visual, imageUrl: `/projects/${projectId}/image/${visual.sceneId}` });
        continue;
      }
    }
    if (!visual.imageUrl.startsWith("http")) {
      next.push(visual);
      continue;
    }
    try {
      const res = await fetch(visual.imageUrl);
      if (!res.ok) {
        next.push(visual);
        continue;
      }
      fs.writeFileSync(stillFile(projectId, visual.sceneId), Buffer.from(await res.arrayBuffer()));
      next.push({ ...visual, imageUrl: `/projects/${projectId}/image/${visual.sceneId}` });
    } catch {
      next.push(visual);
    }
  }
  return next;
}

export function hasVoiceFile(projectId: string) {
  return fs.existsSync(voiceFile(projectId)) && fs.statSync(voiceFile(projectId)).size > 0;
}

export function hasVideoFile(projectId: string) {
  return fs.existsSync(videoFile(projectId)) && fs.statSync(videoFile(projectId)).size > 0;
}

export function removeVoiceFile(projectId: string) {
  const file = voiceFile(projectId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function removeVideoFile(projectId: string) {
  const file = videoFile(projectId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function run(bin: string, args: string[]) {
  if (!bin || !fs.existsSync(bin)) {
    return Promise.reject(new Error("ffmpeg-static is missing. Run npm install in backend."));
  }
  return new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.slice(-1200) || `${bin} exited ${code}`));
    });
  });
}

export async function writeStillFromPng(projectId: string, sceneId: number, png: Buffer) {
  const dir = projectMediaDir(projectId);
  const tmp = path.join(dir, `poster-${sceneId}.png`);
  fs.writeFileSync(tmp, png);
  await run(ffmpegPath, ["-y", "-i", tmp, "-q:v", "2", stillFile(projectId, sceneId)]);
  fs.rmSync(tmp, { force: true });
}

export async function synthesizeSpeech(script: string, projectId: string) {
  const out = voiceFile(projectId);
  const spoken = (script || "Your Reel is ready.").replace(/\s+/g, " ").slice(0, 4000);

  if (config.openaiKey) {
    const openai = new OpenAI({ apiKey: config.openaiKey });
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: spoken,
    });
    fs.writeFileSync(out, Buffer.from(await mp3.arrayBuffer()));
    return { provider: "openai", model: "tts-1", cost: 0.015 };
  }

  const aiff = path.join(projectMediaDir(projectId), "voice.aiff");
  if (fs.existsSync("/usr/bin/say")) {
    await run("/usr/bin/say", ["-o", aiff, "-v", "Samantha", spoken]);
    await run(ffmpegPath, ["-y", "-i", aiff, "-codec:a", "libmp3lame", "-q:a", "4", out]);
    return { provider: "macos-say", model: "Samantha", cost: 0 };
  }

  await run(ffmpegPath, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=mono",
    "-t",
    "30",
    "-c:a",
    "libmp3lame",
    "-q:a",
    "9",
    out,
  ]);
  return { provider: "auteur-studio", model: "silence", cost: 0 };
}

function srtTime(sec: number) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const whole = Math.floor(rest);
  const ms = Math.round((rest - whole) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(whole)},${pad(ms, 3)}`;
}

function writeSrt(cues: CaptionCue[], file: string) {
  const body = cues
    .map((cue, i) => {
      const text = cue.text.replace(/\n/g, " ").slice(0, 80);
      return `${i + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${text}\n`;
    })
    .join("\n");
  fs.writeFileSync(file, body, "utf8");
}

const FALLBACK_COLORS = ["C45C26", "6B3A22", "3D2A1C", "8A4A28", "2B1D14"];

async function sceneImage(visual: Visual | undefined, index: number, dir: string) {
  const url = visual?.imageUrl || "";
  const persisted = visual?.sceneId != null ? path.join(dir, `still-${visual.sceneId}.jpg`) : "";
  if (persisted && fs.existsSync(persisted) && fs.statSync(persisted).size > 0) {
    const file = path.join(dir, `scene-${index}.jpg`);
    if (path.resolve(persisted) !== path.resolve(file)) fs.copyFileSync(persisted, file);
    return file;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const file = path.join(dir, `scene-${index}.jpg`);
        fs.writeFileSync(file, buf);
        return file;
      }
    } catch {
      /* color fallback */
    }
  }
  return null;
}

const MAX_PARALLEL_RENDERS = 2;
let rendersActive = 0;
const renderWaiters: Array<() => void> = [];

async function acquireRenderSlot() {
  if (rendersActive >= MAX_PARALLEL_RENDERS) {
    await new Promise<void>((resolve) => {
      renderWaiters.push(resolve);
    });
  }
  rendersActive += 1;
}

function releaseRenderSlot() {
  rendersActive = Math.max(0, rendersActive - 1);
  const next = renderWaiters.shift();
  if (next) next();
}

export async function renderReel(params: {
  projectId: string;
  script: Script;
  visuals: Visual[] | null;
  captions: { cues: CaptionCue[] } | null;
  primaryColor?: string;
}) {
  if (!hasVoiceFile(params.projectId)) {
    throw new Error("Generate the voice audio first.");
  }
  const queuedAt = Date.now();
  await acquireRenderSlot();
  const queueWaitMs = Date.now() - queuedAt;
  const encodeStarted = Date.now();
  try {
    const result = await encodeReel(params);
    return { ...result, queueWaitMs, encodeMs: Date.now() - encodeStarted };
  } finally {
    releaseRenderSlot();
  }
}

async function encodeReel(params: {
  projectId: string;
  script: Script;
  visuals: Visual[] | null;
  captions: { cues: CaptionCue[] } | null;
  primaryColor?: string;
}) {
  const dir = projectMediaDir(params.projectId);
  const scenes = params.script.scenes.length ? params.script.scenes : [{ id: 1, time: "0–30s", onScreen: "", voiceover: "", visualPrompt: "" }];
  const duration = Math.max(3, Math.round((params.script.durationSec || 30) / scenes.length));
  const hex = (params.primaryColor || "#C45C26").replace("#", "") || "C45C26";

  const inputs: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const visual = params.visuals?.find((v) => v.sceneId === scenes[i].id) || params.visuals?.[i];
    const image = await sceneImage(visual, i, dir);
    if (image) {
      inputs.push("-loop", "1", "-t", String(duration), "-i", image);
    } else {
      const color = FALLBACK_COLORS[i % FALLBACK_COLORS.length] || hex;
      inputs.push("-f", "lavfi", "-i", `color=c=0x${color}:s=1080x1920:d=${duration}`);
    }
  }
  inputs.push("-i", voiceFile(params.projectId));

  const n = scenes.length;
  const concat = scenes.map((_, i) => `[v${i}]`).join("");
  const scaled = scenes
    .map((_, i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[v${i}]`)
    .join(";");
  let filter = `${scaled};${concat}concat=n=${n}:v=1:a=0,format=yuv420p[vout]`;

  const srt = path.join(dir, "captions.srt");
  if (params.captions?.cues?.length) writeSrt(params.captions.cues, srt);

  const vfExtras: string[] = [];
  if (params.captions?.cues?.length) {
    const escaped = srt.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
    vfExtras.push(`subtitles='${escaped}'`);
  }

  if (vfExtras.length) {
    filter = `${scaled};${concat}concat=n=${n}:v=1:a=0,${vfExtras.join(",")},format=yuv420p[vout]`;
  }

  const out = videoFile(params.projectId);
  const args = [
    "-y",
    ...inputs,
    "-filter_complex",
    filter,
    "-map",
    "[vout]",
    "-map",
    `${n}:a`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-t",
    String(params.script.durationSec || 30),
    "-movflags",
    "+faststart",
    out,
  ];

  try {
    await run(ffmpegPath, args);
  } catch (first) {
    const plain = [
      "-y",
      ...inputs,
      "-filter_complex",
      `${scaled};${concat}concat=n=${n}:v=1:a=0,format=yuv420p[vout]`,
      "-map",
      "[vout]",
      "-map",
      `${n}:a`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-t",
      String(params.script.durationSec || 30),
      out,
    ];
    try {
      await run(ffmpegPath, plain);
    } catch {
      throw first;
    }
  }

  if (!hasVideoFile(params.projectId)) {
    throw new Error("Renderer did not produce a video file.");
  }
  return { provider: "auteur-renderer", model: "ffmpeg-1080x1920", cost: 0.01 };
}
