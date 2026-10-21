import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { brandLogoPath } from "./brandAssets.js";

const require = createRequire(import.meta.url);
const ffmpegPath = (require("ffmpeg-static") as string | null) || "ffmpeg";

export type LogoLook = { colors: string[]; shape: "wide" | "tall" | "square" };

const GRID = 24;

function sizeOf(buffer: Buffer) {
  if (buffer.length > 24 && buffer[0] === 0x89 && buffer.toString("latin1", 1, 4) === "PNG") {
    return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
  }
  let i = 2;
  while (buffer[0] === 0xff && buffer[1] === 0xd8 && i + 9 < buffer.length) {
    if (buffer[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buffer[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { w: buffer.readUInt16BE(i + 7), h: buffer.readUInt16BE(i + 5) };
    }
    i += 2 + buffer.readUInt16BE(i + 2);
  }
  return null;
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/** Main colours (up to three) and the overall shape of the logo, read from the file. */
function readLook(file: string): LogoLook | null {
  const buffer = fs.readFileSync(file);
  const size = sizeOf(buffer);
  const run = spawnSync(ffmpegPath, ["-v", "error", "-i", file, "-vf", `scale=${GRID}:${GRID},format=rgba`, "-f", "rawvideo", "-"], {
    maxBuffer: 1024 * 1024,
  });
  const px = run.stdout;
  if (!size || !px || px.length < GRID * GRID * 4) return null;
  const opaque = !file.toLowerCase().endsWith(".png");
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i < GRID * GRID; i++) {
    const [r, g, b, a] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]];
    if (a < 128) continue;
    // A JPEG logo sits on its own white box; that box is not a logo colour.
    if (opaque && r > 235 && g > 235 && b > 235) continue;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const slot = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    slot.n++;
    slot.r += r;
    slot.g += g;
    slot.b += b;
    buckets.set(key, slot);
    total++;
  }
  if (!total) return null;
  const kept: number[][] = [];
  for (const slot of [...buckets.values()].filter((item) => item.n / total >= 0.08).sort((a, b) => b.n - a.n)) {
    const rgb = [slot.r / slot.n, slot.g / slot.n, slot.b / slot.n];
    // Two shades of the same yellow are one colour to a designer.
    if (kept.some((other) => Math.hypot(rgb[0] - other[0], rgb[1] - other[1], rgb[2] - other[2]) < 70)) continue;
    kept.push(rgb);
    if (kept.length === 3) break;
  }
  const colors = kept.map(([r, g, b]) => hex(r, g, b));
  const ratio = size.w / size.h;
  return { colors, shape: ratio > 1.4 ? "wide" : ratio < 0.7 ? "tall" : "square" };
}

/** Cached next to the logo, so the picture prompt stays quick. */
export function logoLook(userId: string): LogoLook | null {
  const file = brandLogoPath(userId);
  if (!file) return null;
  const stat = fs.statSync(file);
  const stamp = `${stat.size}-${stat.mtimeMs}`;
  const cache = path.join(path.dirname(file), "logo-look.json");
  try {
    const saved = JSON.parse(fs.readFileSync(cache, "utf8")) as { stamp: string; look: LogoLook };
    if (saved.stamp === stamp) return saved.look;
  } catch {
    /* not read yet */
  }
  const look = readLook(file);
  if (look) fs.writeFileSync(cache, JSON.stringify({ stamp, look }));
  return look;
}
