import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const ffmpegPath = (require("ffmpeg-static") as string | null) || "ffmpeg";

/**
 * Where the picture will be posted decides its shape.
 * gpt-image-2 and newer paint any size (multiples of 16, up to 3:1), so we ask for the
 * exact shape and nothing is cut. Older image models only paint square, 2:3 and 3:2:
 * for those (a fallback) we paint the closest shape and trim the edges.
 */
export const IMAGE_FORMATS = ["square", "portrait", "story", "wide"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number] | "tall";

type Spec = {
  /** The exact size we ask flexible models for. */
  exact: { w: number; h: number };
  /** What older models paint. */
  native: { w: number; h: number };
  /** Ratio of the file we keep. */
  ratio: { w: number; h: number };
  label: string;
};

const SPECS: Record<ImageFormat, Spec> = {
  square: { exact: { w: 1024, h: 1024 }, native: { w: 1024, h: 1024 }, ratio: { w: 1, h: 1 }, label: "square 1:1 (Instagram or Facebook feed post)" },
  portrait: { exact: { w: 1024, h: 1280 }, native: { w: 1024, h: 1536 }, ratio: { w: 4, h: 5 }, label: "portrait 4:5 (Instagram or Facebook feed post, tall)" },
  story: { exact: { w: 864, h: 1536 }, native: { w: 1024, h: 1536 }, ratio: { w: 9, h: 16 }, label: "vertical 9:16 (Story, Reel cover, TikTok)" },
  wide: { exact: { w: 1536, h: 800 }, native: { w: 1536, h: 1024 }, ratio: { w: 191, h: 100 }, label: "wide 1.91:1 (Facebook post or link picture)" },
  // Older flyers, before people could choose.
  tall: { exact: { w: 1024, h: 1536 }, native: { w: 1024, h: 1536 }, ratio: { w: 2, h: 3 }, label: "tall 2:3" },
};

export function parseImageFormat(raw: unknown): (typeof IMAGE_FORMATS)[number] | "" {
  const value = String(raw ?? "").trim();
  return (IMAGE_FORMATS as readonly string[]).includes(value) ? (value as (typeof IMAGE_FORMATS)[number]) : "";
}

/** Empty = a project made before formats existed: photos were square, flyers 2:3. */
export function resolveImageFormat(kind: "still" | "poster", raw: unknown): ImageFormat {
  return parseImageFormat(raw) || (kind === "poster" ? "tall" : "square");
}

export function formatRatio(format: ImageFormat) {
  const { w, h } = SPECS[format].ratio;
  return { w, h, value: w / h };
}

/** gpt-image-2 and newer accept any WIDTHxHEIGHT (multiples of 16, ratio up to 3:1). */
export function paintsExactSize(model: string) {
  return /^gpt-image-(2|[3-9]|\d{2})/i.test(model);
}

/** Size to ask this model for. Falls back to the closest shape it can paint. */
export function sizeFor(format: ImageFormat, model = "") {
  if (paintsExactSize(model)) {
    const { w, h } = SPECS[format].exact;
    return `${w}x${h}` as "1024x1024";
  }
  const { w, h } = SPECS[format].native;
  if (/^dall-e-3$/i.test(model)) {
    return (w === h ? "1024x1024" : h > w ? "1024x1792" : "1792x1024") as "1024x1024" | "1024x1792" | "1792x1024";
  }
  return `${w}x${h}` as "1024x1024" | "1024x1536" | "1536x1024";
}

/** Reads width and height from a PNG or JPEG header. */
export function imageDimensions(file: string): { w: number; h: number } | null {
  try {
    const fd = fs.openSync(file, "r");
    const head = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    fs.closeSync(fd);
    const buf = head.subarray(0, n);
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) {
          i += 1;
          continue;
        }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch {
    /* unreadable file: caller treats it as unknown */
  }
  return null;
}

/** One prompt line telling the model the shape and where it is safe to put things. */
export function canvasLine(format: ImageFormat) {
  const spec = SPECS[format];
  return `Canvas: ${spec.label}. Compose for exactly this shape and use all of it. Keep every word and the main subject at least 6% away from each edge.`;
}

function runFfmpeg(args: string[], out: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", ...args, out], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0 && fs.existsSync(out) && fs.statSync(out).size > 0));
  });
}

/** Trims a painted picture (centre crop) to the shape of the chosen format. */
export async function cropToFormat(file: string, format: ImageFormat) {
  if (!fs.existsSync(file)) return false;
  const spec = SPECS[format];
  // Painted at the exact shape already: nothing to trim.
  const dims = imageDimensions(file);
  if (dims && Math.abs(dims.w / dims.h - spec.ratio.w / spec.ratio.h) < 0.012) return true;
  const r = `${spec.ratio.w}/${spec.ratio.h}`;
  const tmp = `${file}.crop.jpg`;
  const ok = await runFfmpeg(
    ["-i", file, "-vf", `crop=w=trunc(min(iw\\,ih*${r})/2)*2:h=trunc(min(ih\\,iw/(${r}))/2)*2`, "-q:v", "2"],
    tmp
  );
  if (ok) fs.renameSync(tmp, file);
  else fs.rmSync(tmp, { force: true });
  return ok;
}

/**
 * The picture on screen is already trimmed. Before the model edits it, extend it
 * (blurred edges) back to the shape the model paints, so nothing gets stretched.
 * The extension is trimmed away again afterwards.
 */
export async function padToNative(file: string, format: ImageFormat, out: string) {
  if (!fs.existsSync(file)) return false;
  const spec = SPECS[format];
  if (spec.native.w / spec.native.h === spec.exact.w / spec.exact.h) return false;
  const n = `${spec.native.w}/${spec.native.h}`;
  const W = `trunc(max(iw\\,ih*${n})/2)*2`;
  const H = `trunc(max(ih\\,iw/(${n}))/2)*2`;
  return runFfmpeg(
    [
      "-i",
      file,
      "-filter_complex",
      `[0:v]split[a][b];[b]scale=${W}:${H},boxblur=40:6[bg];[bg][a]overlay=(W-w)/2:(H-h)/2`,
      "-q:v",
      "2",
    ],
    out
  );
}
