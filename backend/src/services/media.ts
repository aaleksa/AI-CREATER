import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { Resvg } from "@resvg/resvg-js";
import { config } from "../config.js";
import {
  contactStampText,
  logoPositionOf,
  wantsContactStamp,
  wantsLogoStamp,
  type BrandKit,
  type CaptionCue,
  type LogoBox,
  type LogoPosition,
  type Script,
  type Visual,
} from "./ai.js";
import { brandLogoPath } from "./brandAssets.js";
import { brandFont, captionFontFile, writeWordmark } from "./brandFont.js";
import { cropToFormat, imageDimensions, type ImageFormat } from "./imageFormats.js";
import { dataDir } from "../dataDir.js";

export {
  brandLogoDir,
  brandLogoPath,
  brandLogoType,
  hasBrandLogo,
  logoKindFromBytes,
  removeBrandKitFiles,
  removeBrandLogo,
  writeBrandLogo,
} from "./brandAssets.js";

const require = createRequire(import.meta.url);
const ffmpegPath = (require("ffmpeg-static") as string | null) || "ffmpeg";


export function projectMediaDir(projectId: string) {
  const dir = path.join(dataDir, "media", projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function projectMediaPath(projectId: string) {
  return path.join(dataDir, "media", projectId);
}

export function removeProjectMedia(projectId: string) {
  const dir = projectMediaPath(projectId);
  fs.rmSync(dir, { recursive: true, force: true });
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

export function copySelectedStill(projectId: string, sceneId: number, versionId?: string, useLiveIfMissing = false) {
  const versionSrc =
    versionId && hasStillVersionFile(projectId, sceneId, versionId)
      ? stillVersionFile(projectId, sceneId, versionId)
      : "";
  const liveSrc = hasStillFile(projectId, sceneId) ? stillFile(projectId, sceneId) : "";
  const src = versionSrc || (useLiveIfMissing || !versionId ? liveSrc : "");
  if (!src) return "";
  const dest = path.join(projectMediaDir(projectId), `keep-lang-${sceneId}.jpg`);
  fs.copyFileSync(src, dest);
  return dest;
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

/** Gap between our stamp and the edge of the picture, in pixels. */
const LOGO_MARGIN = 36;

const CORNER: Record<LogoPosition, string> = {
  "top-left": `${LOGO_MARGIN}:${LOGO_MARGIN}`,
  "top-right": `W-w-${LOGO_MARGIN}:${LOGO_MARGIN}`,
  "bottom-left": `${LOGO_MARGIN}:H-h-${LOGO_MARGIN}`,
  "bottom-right": `W-w-${LOGO_MARGIN}:H-h-${LOGO_MARGIN}`,
};

function overlayLogoFile(stillPath: string, logoPath: string, height = 120, position: LogoPosition = "bottom-right") {
  return overlayLogo(stillPath, logoPath, `[1:v]scale=-1:${height}[lg];[0:v][lg]overlay=${CORNER[position]}`);
}

/** The logo exactly where the owner dragged it, at the width they chose. */
function overlayLogoAt(stillPath: string, logoPath: string, box: LogoBox) {
  const picture = imageDimensions(stillPath);
  if (!picture) return Promise.resolve(false);
  const width = Math.max(8, Math.round(box.w * picture.w));
  const x = Math.round(box.x * picture.w);
  const y = Math.round(box.y * picture.h);
  return overlayLogo(stillPath, logoPath, `[1:v]scale=${width}:-1[lg];[0:v][lg]overlay=${x}:${y}`);
}

function overlayLogo(stillPath: string, logoPath: string, filter: string) {
  if (!ffmpegPath || !fs.existsSync(stillPath) || !fs.existsSync(logoPath)) return Promise.resolve(false);
  const tmp = `${stillPath}.logo.jpg`;
  return new Promise<boolean>((resolve) => {
    const child = spawn(
      ffmpegPath,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        stillPath,
        "-i",
        logoPath,
        "-filter_complex",
        filter,
        tmp,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    child.on("error", () => {
      fs.rmSync(tmp, { force: true });
      resolve(false);
    });
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(tmp) && fs.statSync(tmp).size > 0) {
        fs.renameSync(tmp, stillPath);
        resolve(true);
        return;
      }
      fs.rmSync(tmp, { force: true });
      resolve(false);
    });
  });
}

const SANS_FONTS = [
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
  "/Library/Fonts/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
].filter((file) => fs.existsSync(file));

function xmlEscape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** One small line — "@name · site" — in a dark pill, bottom-left. We draw it, the model never does. */
async function overlayContactFile(stillPath: string, text: string, position: LogoPosition = "bottom-left") {
  if (!text || !ffmpegPath || !fs.existsSync(stillPath)) return false;
  const size = 30;
  const width = Math.round(text.length * size * 0.46 + 56);
  const height = 62;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="31" fill="rgba(12,11,10,0.62)"/>
  <text x="${width / 2}" y="${height / 2 + size * 0.35}" text-anchor="middle" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="${size}" fill="#f4efe8">${xmlEscape(text)}</text>
</svg>`;
  const pill = `${stillPath}.contact.png`;
  const tmp = `${stillPath}.contact.jpg`;
  try {
    const png = new Resvg(svg, {
      font: { loadSystemFonts: true, fontFiles: SANS_FONTS, defaultFontFamily: "Arial" },
    })
      .render()
      .asPng();
    fs.writeFileSync(pill, png);
    await run(ffmpegPath, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      stillPath,
      "-i",
      pill,
      "-filter_complex",
      `[0:v][1:v]overlay=${CORNER[position]}`,
      tmp,
    ]);
    if (fs.existsSync(tmp) && fs.statSync(tmp).size > 0) {
      fs.renameSync(tmp, stillPath);
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    fs.rmSync(pill, { force: true });
    fs.rmSync(tmp, { force: true });
  }
}

/** Logo file, or the business name in the owner's font when there is no logo. Empty when the kit has neither. */
function brandMarkFile(brand: BrandKit) {
  if (!brand.user_id) return { file: "", height: 0 };
  const logo = brandLogoPath(brand.user_id);
  if (logo) return { file: logo, height: 120 };
  const word = writeWordmark(brand.user_id, brand.business_name, brand.primary_color || "#1a1612", brand.secondary_color || "#f4efe8", brand.font);
  return { file: word, height: word ? 76 : 0 };
}

/** Where our stamp will land on this picture, in % of its width and height — so the model can clear exactly that. */
export function brandMarkSpot(brand: BrandKit, stillPath: string) {
  const mark = brandMarkFile(brand);
  const picture = imageDimensions(stillPath);
  const size = mark.file ? imageDimensions(mark.file) : null;
  if (!mark.file || !picture || !size || !size.h) return null;
  const width = (size.w * mark.height) / size.h;
  return {
    w: Math.round((width / picture.w) * 100),
    h: Math.round((mark.height / picture.h) * 100),
    x: Math.round((LOGO_MARGIN / picture.w) * 100),
    y: Math.round((LOGO_MARGIN / picture.h) * 100),
    wordmark: !brandLogoPath(brand.user_id || ""),
  };
}

/** The mark file we stamp (logo, or the business name in their font) — also shown in the Studio while placing it. */
export function brandMarkPath(brand: BrandKit) {
  return brandMarkFile(brand).file;
}

/** Where our automatic stamp lands in this corner, as a box — the start point for placing it by hand. */
export function brandMarkBox(brand: BrandKit, stillPath: string, corner: LogoPosition) {
  const mark = brandMarkFile(brand);
  const picture = imageDimensions(stillPath);
  const size = mark.file ? imageDimensions(mark.file) : null;
  if (!mark.file || !picture || !size || !size.h) return null;
  const w = (size.w * mark.height) / size.h;
  const x = corner.endsWith("left") ? LOGO_MARGIN : picture.w - LOGO_MARGIN - w;
  const y = corner.startsWith("top") ? LOGO_MARGIN : picture.h - LOGO_MARGIN - mark.height;
  return {
    box: { x: x / picture.w, y: y / picture.h, w: w / picture.w },
    markRatio: size.w / size.h,
    pictureRatio: picture.w / picture.h,
  };
}

export async function stampBrandMark(stillPath: string, brand: BrandKit, position: LogoPosition, box?: LogoBox) {
  const mark = brandMarkFile(brand);
  if (!mark.file) return false;
  return box ? overlayLogoAt(stillPath, mark.file, box) : overlayLogoFile(stillPath, mark.file, mark.height, position);
}

export async function persistStills(
  projectId: string,
  visuals: Visual[],
  brand?: BrandKit | null,
  skipLogoStamp = false,
  stampContact = false,
  format?: ImageFormat
) {
  const next: Visual[] = [];
  const fresh = new Set<number>();
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
        fresh.add(visual.sceneId);
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
      fresh.add(visual.sceneId);
      next.push({ ...visual, imageUrl: `/projects/${projectId}/image/${visual.sceneId}` });
    } catch {
      next.push(visual);
    }
  }
  // Trim to the chosen shape first, so the logo and contact line sit in the corners of the final picture.
  if (format) {
    for (const visual of next) {
      if (visual.placeholder || !hasStillFile(projectId, visual.sceneId)) continue;
      if (fresh.has(visual.sceneId)) await cropToFormat(stillFile(projectId, visual.sceneId), format);
    }
  }
  const mark = !skipLogoStamp && brand && wantsLogoStamp(brand) ? brandMarkFile(brand) : { file: "", height: 0 };
  const logo = mark.file;
  // Contact line before the logo, so the clean copy kept for "remove logo" still has it.
  if (stampContact && wantsContactStamp(brand)) {
    const text = contactStampText(brand);
    // The contact line lives bottom-left; it moves right only when the logo took that corner.
    const contactCorner = logo && logoPositionOf(brand) === "bottom-left" ? "bottom-right" : "bottom-left";
    for (const visual of next) {
      if (visual.placeholder || !hasStillFile(projectId, visual.sceneId)) continue;
      await overlayContactFile(stillFile(projectId, visual.sceneId), text, contactCorner);
    }
  }
  if (logo) {
    for (let i = 0; i < next.length; i++) {
      const visual = next[i];
      if (visual.placeholder || visual.clean || !hasStillFile(projectId, visual.sceneId)) continue;
      const clean = keepCleanStill(projectId, visual.sceneId);
      const corner = logoPositionOf(brand);
      if (await overlayLogoFile(stillFile(projectId, visual.sceneId), logo, mark.height, corner)) {
        next[i] = { ...visual, clean, logoCorner: corner };
      }
    }
  }
  return next;
}

export function cleanStillFile(projectId: string, key: string) {
  return path.join(projectMediaDir(projectId), `clean-${key.replace(/[^\w-]/g, "")}.jpg`);
}

export function hasCleanStill(projectId: string, key = "") {
  const file = key ? cleanStillFile(projectId, key) : "";
  return Boolean(file && fs.existsSync(file) && fs.statSync(file).size > 0);
}

/** Copy of the picture as it is now, before a logo goes on. Returns its key. */
export function keepCleanStill(projectId: string, sceneId: number) {
  return keepCleanCopy(projectId, stillFile(projectId, sceneId));
}

export function keepCleanCopy(projectId: string, source: string) {
  const key = randomUUID();
  fs.copyFileSync(source, cleanStillFile(projectId, key));
  return key;
}

export function hasVoiceFile(projectId: string) {
  return fs.existsSync(voiceFile(projectId)) && fs.statSync(voiceFile(projectId)).size > 0;
}

export async function voiceDurationSec(projectId: string) {
  if (!hasVoiceFile(projectId)) return 0;
  return mediaDurationSec(voiceFile(projectId));
}

export function musicFile(projectId: string) {
  return path.join(projectMediaDir(projectId), "music.m4a");
}

export function hasMusicFile(projectId: string) {
  return fs.existsSync(musicFile(projectId)) && fs.statSync(musicFile(projectId)).size > 0;
}

export function removeMusicFile(projectId: string) {
  fs.rmSync(musicFile(projectId), { force: true });
}

export const MUSIC_MAX_BYTES = 20 * 1024 * 1024;
const MUSIC_MAX_SEC = 600;

function audioKindFromBytes(buf: Buffer) {
  if (buf.length < 12) return "";
  if (buf.subarray(0, 3).toString("latin1") === "ID3") return "mp3";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return (buf[1] & 0x06) === 0 ? "aac" : "mp3";
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") return "m4a";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WAVE") return "wav";
  if (buf.subarray(0, 4).toString("latin1") === "OggS") return "ogg";
  if (buf.subarray(0, 4).toString("latin1") === "fLaC") return "flac";
  return "";
}

/** The owner's track, kept as AAC (no cover art, at most 10 minutes). Returns its length in seconds. */
export async function writeMusicFromUpload(projectId: string, buf: Buffer) {
  const kind = audioKindFromBytes(buf);
  if (!kind) throw Object.assign(new Error("Upload an MP3, M4A, WAV or OGG music file."), { status: 400 });
  if (buf.length > MUSIC_MAX_BYTES) throw Object.assign(new Error("Music file is too big. Keep it under 20 MB."), { status: 400 });
  const dir = projectMediaDir(projectId);
  const tmpIn = path.join(dir, `music-upload-${randomUUID()}.${kind}`);
  const tmpOut = path.join(dir, `music-${randomUUID()}.m4a`);
  fs.writeFileSync(tmpIn, buf);
  try {
    await run(ffmpegPath, ["-y", "-i", tmpIn, "-vn", "-sn", "-t", String(MUSIC_MAX_SEC), "-ac", "2", "-ar", "44100", "-c:a", "aac", "-b:a", "160k", tmpOut]);
    const seconds = await mediaDurationSec(tmpOut);
    if (!seconds) throw new Error("empty");
    fs.renameSync(tmpOut, musicFile(projectId));
    return Math.round(seconds * 10) / 10;
  } catch {
    throw Object.assign(new Error("We couldn’t read this music file. Try an MP3 or M4A."), { status: 400 });
  } finally {
    fs.rmSync(tmpIn, { force: true });
    fs.rmSync(tmpOut, { force: true });
  }
}

export type ReelMusic = { volume: number; start: number };

/**
 * Audio for a Reel: the voice (or a quiet track) plus the owner's music, looped to the end,
 * ducked while the voice speaks, faded in and out. Inputs: voice at `voiceIndex` (or none), music at `musicIndex`.
 */
function reelAudioFilter(opts: { voiceIndex: number | null; musicIndex: number; lengthSec: number; music: ReelMusic }) {
  const len = Math.max(1, opts.lengthSec);
  const fadeOut = Math.min(2, len / 4);
  const level = Math.max(0, Math.min(100, opts.music.volume)) / 100;
  const stereo = "aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo";
  const music =
    `[${opts.musicIndex}:a]${stereo},atrim=0:${len.toFixed(2)},asetpts=N/SR/TB,` +
    `volume=${(opts.voiceIndex == null ? level : level * 0.6).toFixed(3)},` +
    `afade=t=in:d=0.4,afade=t=out:st=${(len - fadeOut).toFixed(2)}:d=${fadeOut.toFixed(2)}`;
  if (opts.voiceIndex == null) return `${music}[aout]`;
  return (
    `[${opts.voiceIndex}:a]${stereo},apad,atrim=0:${len.toFixed(2)},asplit=2[vmain][vkey];` +
    `${music}[mraw];[mraw][vkey]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[mduck];` +
    `[vmain][mduck]amix=inputs=2:duration=first:normalize=0[aout]`
  );
}

function musicInputArgs(projectId: string, music: ReelMusic) {
  const start = Math.max(0, music.start || 0);
  return ["-stream_loop", "-1", ...(start ? ["-ss", start.toFixed(1)] : []), "-i", musicFile(projectId)];
}

/** New sound for a finished Reel (music added, changed or removed): the picture is copied as it is, so it is free. */
export async function remixReelAudio(params: { projectId: string; music: ReelMusic | null; silent: boolean }) {
  if (!hasVideoFile(params.projectId)) return false;
  const source = videoFile(params.projectId);
  const lengthSec = (await mediaDurationSec(source)) || 30;
  const withMusic = Boolean(params.music && hasMusicFile(params.projectId));
  if (!params.silent && !hasVoiceFile(params.projectId)) {
    throw Object.assign(new Error("Record the voice first, or choose No voice."), { status: 400 });
  }
  const inputs = ["-i", source];
  let voiceIndex: number | null = null;
  if (!params.silent) {
    inputs.push("-i", voiceFile(params.projectId));
    voiceIndex = 1;
  } else if (!withMusic) {
    inputs.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  }
  const audioArgs: string[] = [];
  if (withMusic) {
    inputs.push(...musicInputArgs(params.projectId, params.music!));
    const musicIndex = voiceIndex == null ? 1 : 2;
    audioArgs.push("-filter_complex", reelAudioFilter({ voiceIndex, musicIndex, lengthSec, music: params.music! }), "-map", "0:v", "-map", "[aout]");
  } else {
    audioArgs.push("-map", "0:v", "-map", "1:a");
  }
  const out = path.join(projectMediaDir(params.projectId), `reel-mix-${randomUUID()}.mp4`);
  try {
    await run(ffmpegPath, ["-y", ...inputs, ...audioArgs, "-c:v", "copy", "-c:a", "aac", "-t", lengthSec.toFixed(2), "-movflags", "+faststart", out]);
    fs.renameSync(out, source);
  } finally {
    fs.rmSync(out, { force: true });
  }
  return true;
}

async function mediaDurationSec(file: string) {
  if (!fs.existsSync(file) || !ffmpegPath || !fs.existsSync(ffmpegPath)) return 0;
  return new Promise<number>((resolve) => {
    const child = spawn(ffmpegPath, ["-hide_banner", "-i", file, "-f", "null", "-"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    child.on("error", () => resolve(0));
    child.on("close", () => {
      const match = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) {
        resolve(0);
        return;
      }
      const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
    });
  });
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

export const CAPTION_STYLES = ["clean", "box", "brand"] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

function assTime(sec: number) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s - h * 3600 - m * 60;
  return `${h}:${String(m).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
}

/** ASS colour: &HAABBGGRR, where AA 00 is solid and FF is see-through. */
function assColour(hex: string, opacity = 1) {
  const rgb = hexRgb(hex) || [255, 255, 255];
  const alpha = Math.round((1 - Math.max(0, Math.min(1, opacity))) * 255);
  const two = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `&H${two(alpha)}${two(rgb[2])}${two(rgb[1])}${two(rgb[0])}`;
}

/**
 * Captions the way Reels look: heavy type, centred, above Instagram's caption and buttons (and above a logo in a
 * bottom corner). "clean" is white with a soft shadow, "box" sits on a dark see-through band, "brand" uses their
 * title font on their main colour.
 */
function writeAss(cues: CaptionCue[], file: string, opts: { style: CaptionStyle; brand?: BrandKit | null; bottomPx: number }) {
  const fontsDir = path.join(path.dirname(file), "caption-fonts");
  fs.rmSync(fontsDir, { recursive: true, force: true });
  fs.mkdirSync(fontsDir, { recursive: true });
  const own = opts.style === "brand" && opts.brand?.user_id ? brandFont(opts.brand.user_id, opts.brand.font) : null;
  const heavy = captionFontFile(opts.style === "box" ? "bold" : "extrabold");
  const fontFile = own?.file || heavy;
  let family = "Arial";
  let heavyBold = 0;
  if (fontFile) {
    fs.copyFileSync(fontFile, path.join(fontsDir, path.basename(fontFile)));
    // libass matches the plain family name (name ID 1): "Montserrat" + bold for Bold, "Montserrat ExtraBold" for ExtraBold.
    if (own) family = own.family || "Arial";
    else if (opts.style === "box") {
      family = "Montserrat";
      heavyBold = -1;
    } else family = "Montserrat ExtraBold";
  }
  const primary = hexRgb(opts.brand?.primary_color) ? opts.brand!.primary_color! : "#1a1612";
  const onPrimary = luminance(primary) > 0.6 ? "#1a1612" : "#ffffff";
  const look =
    opts.style === "box"
      ? { size: 72, text: assColour("#ffffff"), outline: assColour("#0c0b0a", 0.62), back: assColour("#000000", 0), border: 3, outlineW: 16, shadow: 0, bold: heavyBold }
      : opts.style === "brand"
        ? { size: 74, text: assColour(onPrimary), outline: assColour(primary, 0.92), back: assColour("#000000", 0), border: 3, outlineW: 18, shadow: 0, bold: own ? -1 : 0 }
        : { size: 86, text: assColour("#ffffff"), outline: assColour("#000000", 0.55), back: assColour("#000000", 0.35), border: 1, outlineW: 4, shadow: 3, bold: 0 };
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Cap,${family},${look.size},${look.text},${look.text},${look.outline},${look.back},${look.bold},0,0,0,100,100,0,0,${look.border},${look.outlineW},${look.shadow},2,90,90,${Math.round(opts.bottomPx)},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const lines = cues.map((cue) => {
    const text = cue.text.replace(/\s+/g, " ").trim().slice(0, 80).replace(/\\/g, "").replace(/[{}]/g, "");
    return `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Cap,,0,0,0,,${text}`;
  });
  fs.writeFileSync(file, [...header, ...lines, ""].join("\n"), "utf8");
  return fontsDir;
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
  /** No voice: a quiet audio track instead, so Instagram and phones play it as a normal video. */
  silent?: boolean;
  music?: ReelMusic | null;
  /** The small logo over the scenes, and the end card after them. */
  logo?: ReelLogoLayer | null;
  endCard?: ReelEndCard | null;
  captionStyle?: CaptionStyle;
  brand?: BrandKit | null;
}) {
  if (!params.silent && !hasVoiceFile(params.projectId)) {
    throw Object.assign(new Error("Record the voice first."), { status: 400 });
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
  silent?: boolean;
  music?: ReelMusic | null;
  logo?: ReelLogoLayer | null;
  endCard?: ReelEndCard | null;
  captionStyle?: CaptionStyle;
  brand?: BrandKit | null;
}) {
  const dir = projectMediaDir(params.projectId);
  const scenes = params.script.scenes.length ? params.script.scenes : [{ id: 1, time: "0–30s", onScreen: "", voiceover: "", visualPrompt: "" }];
  const duration = Math.max(3, Math.round((params.script.durationSec || 30) / scenes.length));
  const hex = (params.primaryColor || "#C45C26").replace("#", "") || "C45C26";
  const n = scenes.length;
  const endCard = params.endCard && fs.existsSync(params.endCard.file) ? params.endCard.file : "";
  // With an end card the scenes play in full and the card follows; without one we keep the script's length.
  const mainSec = endCard ? duration * n : Math.min(params.script.durationSec || 30, duration * n);
  const totalSec = mainSec + (endCard ? END_CARD_SEC : 0);

  const inputs: string[] = [];
  let next = 0;
  for (let i = 0; i < n; i++) {
    const visual = params.visuals?.find((v) => v.sceneId === scenes[i].id) || params.visuals?.[i];
    const image = await sceneImage(visual, i, dir);
    if (image) {
      inputs.push("-loop", "1", "-t", String(duration), "-i", image);
    } else {
      const color = FALLBACK_COLORS[i % FALLBACK_COLORS.length] || hex;
      inputs.push("-f", "lavfi", "-i", `color=c=0x${color}:s=1080x1920:d=${duration}`);
    }
    next += 1;
  }
  const endIndex = endCard ? next++ : -1;
  if (endCard) inputs.push("-loop", "1", "-t", String(END_CARD_SEC), "-i", endCard);

  const withMusic = Boolean(params.music && hasMusicFile(params.projectId));
  let voiceIndex: number | null = null;
  let quietIndex = -1;
  if (!params.silent) {
    voiceIndex = next++;
    inputs.push("-i", voiceFile(params.projectId));
  } else if (!withMusic) {
    quietIndex = next++;
    inputs.push("-f", "lavfi", "-t", String(totalSec), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  }
  const musicIndex = withMusic ? next++ : -1;
  if (withMusic) inputs.push(...musicInputArgs(params.projectId, params.music!));
  const logo = params.logo && fs.existsSync(params.logo.file) ? params.logo : null;
  const logoIndex = logo ? next++ : -1;
  if (logo) inputs.push("-loop", "1", "-t", String(totalSec), "-i", logo.file);

  let audioFilter = "";
  let audioMap = "";
  if (withMusic) {
    audioFilter = `;${reelAudioFilter({ voiceIndex, musicIndex, lengthSec: totalSec, music: params.music! })}`;
    audioMap = "[aout]";
  } else if (voiceIndex != null && endCard) {
    // The voice ends before the card; pad it so the card is not cut off.
    audioFilter = `;[${voiceIndex}:a]apad,atrim=0:${totalSec.toFixed(2)}[aout]`;
    audioMap = "[aout]";
  } else {
    audioMap = `${voiceIndex ?? quietIndex}:a`;
  }

  const fit = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30";
  const parts = scenes.map((_, i) => `[${i}:v]${fit}[v${i}]`);
  if (endCard) parts.push(`[${endIndex}:v]${fit},fade=t=in:st=0:d=0.35:color=0x${params.endCard!.ground.replace("#", "")}[vend]`);
  const concatIn = scenes.map((_, i) => `[v${i}]`).join("") + (endCard ? "[vend]" : "");
  const segments = `${parts.join(";")};${concatIn}concat=n=${n + (endCard ? 1 : 0)}:v=1:a=0`;

  const logoNow = params.logo && fs.existsSync(params.logo.file) ? params.logo : null;
  // Above Instagram's caption and buttons; above our logo when it sits in a bottom corner.
  const bottomPx = logoNow && logoNow.corner.startsWith("bottom") ? REEL_BOTTOM + logoNow.h + 36 : Math.round(1920 * 0.24);
  const assFile = path.join(dir, "captions.ass");
  const subtitles = params.captions?.cues?.length ? assFile : "";
  const fontsDir = subtitles ? writeAss(params.captions!.cues, assFile, { style: params.captionStyle || "clean", brand: params.brand, bottomPx }) : "";
  const esc = (file: string) => file.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");

  const videoFilter = (withSubtitles: boolean) => {
    const subs = withSubtitles && subtitles ? `,subtitles='${esc(subtitles)}':fontsdir='${esc(fontsDir)}'` : "";
    if (!logo) return `${segments}${subs},format=yuv420p[vout]`;
    // The small logo sits on the scenes only; the end card carries the big one.
    return (
      `${segments}[vcat];[${logoIndex}:v]format=rgba,fade=t=in:st=0.3:d=0.6:alpha=1[lg];` +
      `[vcat][lg]overlay=${reelLogoXY(logo)}:enable='lt(t,${mainSec.toFixed(2)})'${subs},format=yuv420p[vout]`
    );
  };

  const out = videoFile(params.projectId);
  const encode = (withSubtitles: boolean) => [
    "-y",
    ...inputs,
    "-filter_complex",
    videoFilter(withSubtitles) + audioFilter,
    "-map",
    "[vout]",
    "-map",
    audioMap,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-t",
    totalSec.toFixed(2),
    "-movflags",
    "+faststart",
    out,
  ];

  try {
    await run(ffmpegPath, encode(true));
  } catch (first) {
    if (!subtitles) throw first;
    try {
      await run(ffmpegPath, encode(false));
    } catch {
      throw first;
    }
  }

  if (!hasVideoFile(params.projectId)) {
    throw new Error("Renderer did not produce a video file.");
  }
  return { provider: "auteur-renderer", model: "ffmpeg-1080x1920", cost: 0.01 };
}

/* ---------- Logo on a Reel: one layer over the video, plus an end card ---------- */

export type ReelLogoSize = "s" | "m" | "l";
export type ReelLogoSettings = { show: boolean; corner: LogoPosition; size: ReelLogoSize; endCard: boolean; plate: boolean };
export type ReelLogoLayer = { file: string; w: number; h: number; corner: LogoPosition };
export type ReelEndCard = { file: string; ground: string };

const END_CARD_SEC = 2.5;
/** Largest logo box on a 1080×1920 Reel, in pixels: wide logos are held by the width, tall ones by the height. */
const REEL_LOGO_BOX: Record<ReelLogoSize, [number, number]> = { s: [170, 110], m: [230, 150], l: [300, 200] };
const REEL_SIDE = 48;
/** Instagram's own bar covers the top; caption, reply box and buttons cover the bottom. */
const REEL_TOP = Math.round(1920 * 0.12);
const REEL_BOTTOM = Math.round(1920 * 0.22);

function reelLogoXY(logo: ReelLogoLayer) {
  const x = logo.corner.endsWith("left") ? REEL_SIDE : 1080 - REEL_SIDE - logo.w;
  const y = logo.corner.startsWith("top") ? REEL_TOP : 1920 - REEL_BOTTOM - logo.h;
  return `${x}:${y}`;
}

function runCapture(bin: string, args: string[]) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`${bin} exited ${code}`))));
  });
}

/** How the mark looks: its average brightness (0–1) over the visible pixels, and whether it has a see-through background. */
async function markTone(file: string) {
  try {
    const raw = await runCapture(ffmpegPath, ["-v", "error", "-i", file, "-vf", "scale=48:48", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"]);
    let sum = 0;
    let count = 0;
    let clear = 0;
    for (let i = 0; i + 3 < raw.length; i += 4) {
      const alpha = raw[i + 3];
      if (alpha < 128) {
        clear += 1;
        continue;
      }
      sum += (0.2126 * raw[i] + 0.7152 * raw[i + 1] + 0.0722 * raw[i + 2]) / 255;
      count += 1;
    }
    const pixels = raw.length / 4 || 1;
    return { light: count ? sum / count : 0.5, seeThrough: clear / pixels > 0.08 };
  } catch {
    return { light: 0.5, seeThrough: true };
  }
}

function svgPng(svg: string, fonts: string[] = [], family = "Arial") {
  return new Resvg(svg, {
    font: { loadSystemFonts: true, fontFiles: [...fonts, ...SANS_FONTS], defaultFontFamily: family },
  })
    .render()
    .asPng();
}

/**
 * The small logo for the whole Reel, on a soft rounded plate so it reads on any photo: a light plate for dark or
 * colourful logos, a dark one for white logos. A business name set in their font already sits on its own pill.
 */
export async function writeReelLogoBadge(projectId: string, brand: BrandKit, size: ReelLogoSize, withPlate = true): Promise<Omit<ReelLogoLayer, "corner"> | null> {
  if (!brand.user_id) return null;
  const logo = brandLogoPath(brand.user_id);
  const mark = logo || writeWordmark(brand.user_id, brand.business_name, brand.primary_color || "#1a1612", brand.secondary_color || "#f4efe8", brand.font);
  const dims = mark ? imageDimensions(mark) : null;
  if (!mark || !dims || !dims.w || !dims.h) return null;
  const [boxW, boxH] = REEL_LOGO_BOX[size] || REEL_LOGO_BOX.m;
  const scale = Math.min(boxW / dims.w, boxH / dims.h);
  const w = Math.max(2, Math.round((dims.w * scale) / 2) * 2);
  const h = Math.max(2, Math.round((dims.h * scale) / 2) * 2);
  const dir = projectMediaDir(projectId);
  const out = path.join(dir, "reel-logo.png");
  if (!logo || !withPlate) {
    await run(ffmpegPath, ["-y", "-v", "error", "-i", mark, "-vf", `scale=${w}:${h}`, out]);
    return { file: out, w, h };
  }
  const tone = await markTone(mark);
  const pad = Math.max(14, Math.round(Math.min(w, h) * 0.16));
  const plateW = w + pad * 2;
  const plateH = h + pad * 2;
  const fill = tone.light > 0.62 ? "#121010" : "#ffffff";
  const opacity = tone.light > 0.62 ? 0.5 : 0.82;
  const plate = path.join(dir, "reel-logo-plate.png");
  fs.writeFileSync(
    plate,
    svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${plateW}" height="${plateH}" viewBox="0 0 ${plateW} ${plateH}">
  <rect width="${plateW}" height="${plateH}" rx="${Math.min(28, Math.round(plateH / 4))}" fill="${fill}" fill-opacity="${opacity}"/>
</svg>`)
  );
  try {
    await run(ffmpegPath, ["-y", "-v", "error", "-i", plate, "-i", mark, "-filter_complex", `[1:v]scale=${w}:${h}[m];[0:v][m]overlay=${pad}:${pad}`, out]);
  } finally {
    fs.rmSync(plate, { force: true });
  }
  return { file: out, w: plateW, h: plateH };
}

function hexRgb(hex = "") {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function luminance(hex = "") {
  const rgb = hexRgb(hex);
  return rgb ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 : 0.5;
}

function wrapLines(text: string, perLine: number, maxLines: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > perLine && line) {
      lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[.,;:!?…]*$/, "")}…`;
    return kept;
  }
  return lines;
}

/** Width of one line of text in this font, in pixels, measured by the same renderer that draws it. */
function textWidth(text: string, size: number, fonts: string[], family: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(200, text.length * size)}" height="${size * 2}"><text x="0" y="${size}" font-family="${family}" font-size="${size}">${xmlEscape(text)}</text></svg>`;
  try {
    const box = new Resvg(svg, { font: { loadSystemFonts: false, fontFiles: [...fonts, ...SANS_FONTS], defaultFontFamily: family } }).getBBox();
    return box ? box.width : text.length * size * 0.55;
  } catch {
    return text.length * size * 0.55;
  }
}

/**
 * The whole call to action, never cut: the largest size at which it fits the card in a few lines. Long ones get
 * smaller type and more lines; a word longer than the line still gets a line of its own.
 */
function fitCallToAction(text: string, fonts: string[], family: string) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return { size: 72, lines: [] as string[] };
  const maxWidth = 920;
  const steps: [number, number][] = [[72, 3], [64, 4], [56, 4], [50, 5], [44, 6]];
  let best = { size: 44, lines: [] as string[] };
  for (const [size, maxLines] of steps) {
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const tryLine = line ? `${line} ${word}` : word;
      if (line && textWidth(tryLine, size, fonts, family) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = tryLine;
    }
    if (line) lines.push(line);
    best = { size, lines };
    if (lines.length <= maxLines) return best;
  }
  return best;
}

/**
 * The last 2.5 seconds: their logo large, the call to action and where to find them. Light paper for ordinary logos,
 * a dark ground for white ones, so the logo always reads.
 */
export async function writeReelEndCard(projectId: string, brand: BrandKit, cta: string): Promise<ReelEndCard | null> {
  if (!brand.user_id) return null;
  const logo = brandLogoPath(brand.user_id);
  const name = String(brand.business_name || "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!logo && !name) return null;
  const tone = logo ? await markTone(logo) : { light: 0, seeThrough: true };
  const primary = hexRgb(brand.primary_color) ? brand.primary_color! : "#1a1612";
  const paper = hexRgb(brand.secondary_color) && luminance(brand.secondary_color) > 0.8 ? brand.secondary_color! : "#f6f1ea";
  const dark = tone.light > 0.62;
  const ground = dark ? (luminance(primary) < 0.35 ? primary : "#1a1612") : paper;
  const ink = dark ? "#f4efe8" : luminance(primary) < 0.45 ? primary : "#1a1612";
  const muted = dark ? "rgba(244,239,232,0.72)" : "rgba(26,22,18,0.62)";
  const font = brandFont(brand.user_id, brand.font);
  const family = font ? xmlEscape(font.family) : "Arial";
  const fit = fitCallToAction(String(cta || ""), font ? [font.file] : [], font ? font.family : "Arial");
  const ctaLines = fit.lines;
  const lineGap = Math.round(fit.size * 1.28);
  const contact = contactStampText(brand);
  const logoBox: [number, number] = [620, 420];
  // Everything stays above Instagram's caption and buttons (bottom ~22%): a long call to action lifts the logo.
  const blockBelow = 170 + Math.max(0, ctaLines.length - 1) * lineGap + (contact ? 56 + 40 : 0) + (logo ? 0 : 300);
  const logoTop = Math.max(300, Math.min(560, 1500 - logoBox[1] - blockBelow));
  let textTop = logoTop + logoBox[1] + 170;
  const texts: string[] = [];
  const accent = dark ? "rgba(244,239,232,0.6)" : luminance(primary) > 0.85 ? ink : primary;
  if (!logo) {
    const nameLines = wrapLines(name, 14, 2);
    nameLines.forEach((line, i) => texts.push(`<text x="540" y="${logoTop + 180 + i * 120}" text-anchor="middle" font-family="${family}" font-size="104" fill="${ink}">${xmlEscape(line)}</text>`));
    textTop = logoTop + 180 + nameLines.length * 120 + 130;
  }
  if (ctaLines.length) texts.push(`<rect x="500" y="${textTop - 110}" width="80" height="8" rx="4" fill="${accent}"/>`);
  ctaLines.forEach((line, i) => texts.push(`<text x="540" y="${textTop + i * lineGap}" text-anchor="middle" font-family="${family}" font-size="${fit.size}" fill="${ink}">${xmlEscape(line)}</text>`));
  if (contact) {
    const y = textTop + Math.max(0, ctaLines.length - 1) * lineGap + (ctaLines.length ? 56 + 40 : 0);
    texts.push(`<text x="540" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, DejaVu Sans, sans-serif" font-size="40" fill="${muted}">${xmlEscape(contact)}</text>`);
  }
  const dir = projectMediaDir(projectId);
  const ground_png = path.join(dir, "reel-end-ground.png");
  const out = path.join(dir, "reel-end.png");
  fs.writeFileSync(
    ground_png,
    svgPng(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="${ground}"/>${texts.join("")}</svg>`,
      font ? [font.file] : [],
      font ? font.family : "Arial"
    )
  );
  try {
    if (logo) {
      const dims = imageDimensions(logo);
      if (!dims || !dims.w || !dims.h) return null;
      const scale = Math.min(logoBox[0] / dims.w, logoBox[1] / dims.h);
      const w = Math.round((dims.w * scale) / 2) * 2;
      const h = Math.round((dims.h * scale) / 2) * 2;
      const y = logoTop + Math.round((logoBox[1] - h) / 2);
      await run(ffmpegPath, ["-y", "-v", "error", "-i", ground_png, "-i", logo, "-filter_complex", `[1:v]scale=${w}:${h}[m];[0:v][m]overlay=${(1080 - w) / 2}:${y}`, out]);
    } else {
      fs.copyFileSync(ground_png, out);
    }
  } finally {
    fs.rmSync(ground_png, { force: true });
  }
  return fs.existsSync(out) ? { file: out, ground } : null;
}

/** Reel frames carry no logo any more (it is one layer over the video): put back the clean copy of any stamped frame. */
export function unstampReelFrames(projectId: string, visuals: Visual[]) {
  let changed = false;
  const next = visuals.map((visual) => {
    if (visual.placeholder || !visual.clean || !visual.logoCorner) return visual;
    const clean = cleanStillFile(projectId, visual.clean);
    // No clean copy left (removed after 7 days): keep the stamped frame as it is rather than lose track of its logo.
    if (!fs.existsSync(clean) || !hasStillFile(projectId, visual.sceneId)) return visual;
    fs.copyFileSync(clean, stillFile(projectId, visual.sceneId));
    changed = true;
    const { logoCorner: _corner, logoBox: _box, ...rest } = visual;
    return rest as Visual;
  });
  return { visuals: next, changed };
}
