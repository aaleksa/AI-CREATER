import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import { formatRatio, imageDimensions, type ImageFormat } from "./imageFormats.js";
import { pdfWithJpeg, pngToJpeg, runFfmpeg } from "./print.js";

/** A picture the owner brings: big phone photos and print files are fine. */
export const OWN_PICTURE_MAX = 15 * 1024 * 1024;
/** Longest side we keep and print from (well above A4 at 300 dpi for most photos, and bounded memory). */
const MAX_SIDE = 4096;

export function sniffPicture(buf: Buffer): "png" | "jpeg" | "webp" | "" {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf.length > 12 && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return "";
}

/** Writes an uploaded picture as the project's still: PNG and JPEG as they are, WebP turned into PNG (keeps transparency). */
export async function writeOwnPicture(buf: Buffer, dest: string) {
  const kind = sniffPicture(buf);
  if (!kind) throw Object.assign(new Error("Upload a PNG, JPG or WebP picture."), { status: 400 });
  if (buf.length > OWN_PICTURE_MAX) throw Object.assign(new Error("That file is too big."), { status: 413 });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (kind !== "webp") {
    fs.writeFileSync(dest, buf);
  } else {
    const tmp = path.join(path.dirname(dest), `own-${randomUUID()}.webp`);
    const out = tmp.replace(/\.webp$/, ".png");
    try {
      fs.writeFileSync(tmp, buf);
      if (!(await runFfmpeg(["-i", tmp, out])) || !fs.existsSync(out)) {
        throw Object.assign(new Error("We couldn’t open that picture. Try a JPG or PNG."), { status: 400 });
      }
      fs.copyFileSync(out, dest);
    } finally {
      fs.rmSync(tmp, { force: true });
      fs.rmSync(out, { force: true });
    }
  }
  const size = imageDimensions(dest);
  if (!size?.w || !size?.h) {
    fs.rmSync(dest, { force: true });
    throw Object.assign(new Error("We couldn’t open that picture. Try a JPG or PNG."), { status: 400 });
  }
  return size;
}

async function dataUri(file: string) {
  const bytes = fs.readFileSync(file);
  const kind = sniffPicture(bytes);
  const jpeg = kind === "jpeg" ? bytes : kind === "png" || kind === "webp" ? await pngToJpeg(bytes, path.dirname(file)) : bytes;
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export type ReshapeMode = "crop" | "fit";
/** What fills the empty bands when the picture is fitted: a blurred copy of it, or a plain colour. */
export type ReshapeBackground = "blur" | "white" | "black" | string;

export function readReshape(raw: unknown) {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mode: ReshapeMode = row.mode === "fit" ? "fit" : "crop";
  const bg = String(row.background || "blur");
  const background: ReshapeBackground = bg === "white" || bg === "black" || bg === "blur" || /^#[0-9a-f]{6}$/i.test(bg) ? bg : "blur";
  const share = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
  };
  return { mode, background, focus: { x: share(row.focusX), y: share(row.focusY) } };
}

/**
 * The same picture in another shape, without AI: cut to the shape around a focus point, or fitted whole with bands.
 * Never upscales the photo itself; the page keeps the picture's own sharpness.
 */
export async function reshapePicture(
  src: string,
  dest: string,
  format: ImageFormat,
  opts: { mode: ReshapeMode; background: ReshapeBackground; focus: { x: number; y: number } }
) {
  fs.writeFileSync(dest, await renderReshape(src, format, opts, MAX_SIDE));
}

/** The reshaped picture as a JPEG; `maxSide` keeps a preview small (same cut and bands as the saved one). */
export async function renderReshape(
  src: string,
  format: ImageFormat,
  opts: { mode: ReshapeMode; background: ReshapeBackground; focus: { x: number; y: number } },
  maxSide: number
) {
  const size = imageDimensions(src);
  if (!size?.w || !size?.h) throw Object.assign(new Error("Make the picture first."), { status: 400 });
  const target = formatRatio(format).value;
  const source = size.w / size.h;
  let W: number;
  let H: number;
  if (opts.mode === "crop") {
    // The biggest piece of this shape inside the picture.
    W = source > target ? size.h * target : size.w;
    H = source > target ? size.h : size.w / target;
  } else {
    // The smallest page of this shape the whole picture fits on.
    W = source > target ? size.w : size.h * target;
    H = source > target ? size.w / target : size.h;
  }
  const scale = Math.min(1, maxSide / Math.max(W, H));
  W = Math.max(16, Math.round(W * scale));
  H = Math.max(16, Math.round(H * scale));
  const href = await dataUri(src);
  let body: string;
  if (opts.mode === "crop") {
    const cover = Math.max(W / size.w, H / size.h);
    const iw = size.w * cover;
    const ih = size.h * cover;
    const x = -(iw - W) * opts.focus.x;
    const y = -(ih - H) * opts.focus.y;
    body = `<image href="${href}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${iw.toFixed(1)}" height="${ih.toFixed(1)}"/>`;
  } else {
    const fit = Math.min(W / size.w, H / size.h);
    const iw = size.w * fit;
    const ih = size.h * fit;
    const x = (W - iw) / 2;
    const y = (H - ih) / 2;
    const ground =
      opts.background === "blur"
        ? `<defs><filter id="b" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${Math.round(Math.max(W, H) / 40)}"/></filter></defs>
  <image href="${href}" x="-5%" y="-5%" width="110%" height="110%" preserveAspectRatio="xMidYMid slice" filter="url(#b)"/>
  <rect width="${W}" height="${H}" fill="#000" fill-opacity="0.12"/>`
        : `<rect width="${W}" height="${H}" fill="${opts.background === "white" ? "#ffffff" : opts.background === "black" ? "#000000" : opts.background}"/>`;
    body = `${ground}
  <image href="${href}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${iw.toFixed(1)}" height="${ih.toFixed(1)}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: "original" }, font: { loadSystemFonts: false } }).render().asPng();
  return pngToJpeg(Buffer.from(png), path.dirname(src));
}

/** Paper sizes at 300 dpi (portrait) and in PDF points; the page turns to match the picture. */
const PAPERS = {
  a4: { px: { w: 2480, h: 3508 }, pt: { w: 595.28, h: 841.89 } },
  a5: { px: { w: 1748, h: 2480 }, pt: { w: 419.53, h: 595.28 } },
  a6: { px: { w: 1240, h: 1748 }, pt: { w: 297.64, h: 419.53 } },
} as const;
export type Paper = keyof typeof PAPERS;

export function readPaper(raw: unknown): Paper {
  return raw === "a4" || raw === "a6" ? raw : "a5";
}

/**
 * The picture on a printed page: `fill` covers the page edge to edge (the edges are trimmed), otherwise the whole
 * picture sits on a white page. Landscape pictures get a landscape page.
 */
export async function printPicture(src: string, paper: Paper, fill: boolean) {
  const size = imageDimensions(src);
  if (!size?.w || !size?.h) throw Object.assign(new Error("Make the picture first."), { status: 400 });
  const spec = PAPERS[paper];
  const landscape = size.w > size.h;
  const px = landscape ? { w: spec.px.h, h: spec.px.w } : spec.px;
  const pt = landscape ? { w: spec.pt.h, h: spec.pt.w } : spec.pt;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px.w}" height="${px.h}" viewBox="0 0 ${px.w} ${px.h}">
  <rect width="${px.w}" height="${px.h}" fill="#ffffff"/>
  <image href="${dataUri(src)}" x="0" y="0" width="${px.w}" height="${px.h}" preserveAspectRatio="xMidYMid ${fill ? "slice" : "meet"}"/>
</svg>`;
  const rendered = new Resvg(svg, { fitTo: { mode: "original" }, font: { loadSystemFonts: false } }).render();
  const jpeg = await pngToJpeg(Buffer.from(rendered.asPng()), path.dirname(src));
  return pdfWithJpeg(jpeg, rendered.width, rendered.height, pt);
}
