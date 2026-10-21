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
import { writeWordmark } from "./brandFont.js";
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

function overlayLogoFile(stillPath: string, logoPath: string, height = 120, position: LogoPosition = "bottom-right", reel = false) {
  return overlayLogo(stillPath, logoPath, `[1:v]scale=-1:${height}[lg];[0:v][lg]overlay=${reel ? reelCorner(stillPath, position) : CORNER[position]}`);
}

/**
 * A Reel frame is 2:3, the mp4 is 9:16: the sides get cut. Instagram also draws its bar at the top and the caption,
 * reply box and buttons at the bottom. The logo goes inside what stays visible and clear.
 */
function reelCorner(stillPath: string, position: LogoPosition) {
  const size = imageDimensions(stillPath);
  if (!size) return CORNER[position];
  const cut = Math.max(0, Math.round((size.w - Math.min(size.w, (size.h * 9) / 16)) / 2));
  const side = cut + LOGO_MARGIN;
  const top = Math.round(size.h * 0.12);
  const bottom = Math.round(size.h * 0.22);
  const x = position.endsWith("left") ? `${side}` : `W-w-${side}`;
  const y = position.startsWith("top") ? `${top}` : `H-h-${bottom}`;
  return `${x}:${y}`;
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

/**
 * Reel frames stamped before the logo knew about the 9:16 crop: put it back from the clean copy, inside the part of the
 * frame the mp4 keeps. Frames without our logo are left alone.
 */
export async function restampReelFrames(projectId: string, visuals: Visual[], brand: BrandKit) {
  const mark = brandMarkFile(brand);
  if (!mark.file) return;
  for (const visual of visuals) {
    if (visual.placeholder || !visual.clean || !visual.logoCorner) continue;
    const clean = cleanStillFile(projectId, visual.clean);
    if (!fs.existsSync(clean) || !hasStillFile(projectId, visual.sceneId)) continue;
    const still = stillFile(projectId, visual.sceneId);
    const before = fs.readFileSync(still);
    fs.copyFileSync(clean, still);
    if (!(await overlayLogoFile(still, mark.file, mark.height, visual.logoCorner, true))) fs.writeFileSync(still, before);
  }
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
      if (await overlayLogoFile(stillFile(projectId, visual.sceneId), logo, mark.height, corner, !format)) {
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
  /** No voice: a quiet audio track instead, so Instagram and phones play it as a normal video. */
  silent?: boolean;
  music?: ReelMusic | null;
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
  const n = scenes.length;
  const withMusic = Boolean(params.music && hasMusicFile(params.projectId));
  const lengthSec = Math.min(params.script.durationSec || 30, duration * n);
  if (!params.silent) inputs.push("-i", voiceFile(params.projectId));
  else if (!withMusic) inputs.push("-f", "lavfi", "-t", String(params.script.durationSec || 30), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  if (withMusic) inputs.push(...musicInputArgs(params.projectId, params.music!));
  const audioFilter = withMusic
    ? `;${reelAudioFilter({ voiceIndex: params.silent ? null : n, musicIndex: params.silent ? n : n + 1, lengthSec, music: params.music! })}`
    : "";
  const audioMap = withMusic ? "[aout]" : `${n}:a`;

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
    filter + audioFilter,
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
      `${scaled};${concat}concat=n=${n}:v=1:a=0,format=yuv420p[vout]${audioFilter}`,
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
