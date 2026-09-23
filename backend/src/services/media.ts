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
