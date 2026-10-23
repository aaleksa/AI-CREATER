import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import type { BrandKit } from "./ai.js";
import { brandFont } from "./brandFont.js";
import { brandLogoPath } from "./brandAssets.js";
import { projectMediaDir, stillFile } from "./media.js";

const require = createRequire(import.meta.url);
const ffmpegPath = (require("ffmpeg-static") as string | null) || "ffmpeg";

/** A5 landscape at 300 dpi: what a print shop expects. */
const PRINT = { w: 2480, h: 1748 };
/** The same page in PDF points (1/72 inch). */
const PAGE = { w: 595.28, h: 419.53 };
const MAX_ITEMS = 50;

const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../frontend/public/fonts");
const SANS_FONTS = [
  path.join(FONT_DIR, "Montserrat-Bold.ttf"),
  path.join(FONT_DIR, "Montserrat-ExtraBold.ttf"),
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
].filter((file) => fs.existsSync(file));

export type CertificateItem = { name: string; gift: string; validUntil: string; code: string };
/** codes: print a code on each certificate (made for the empty ones). Off: no code at all. */
export type CertificateSettings = { title: string; note: string; lang: "uk" | "en"; codes: boolean; items: CertificateItem[] };

const LABELS = {
  uk: { title: "Подарунковий сертифікат", for: "Для", valid: "Дійсний до", code: "Код" },
  en: { title: "Gift certificate", for: "For", valid: "Valid until", code: "Code" },
};

function clip(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** A short code that is easy to read out on the phone: no 0/O or 1/I. */
export function newCertificateCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export function parseCertificate(raw: unknown, fallbackLang: "uk" | "en"): CertificateSettings {
  const body = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof CertificateSettings, unknown>>;
  const lang = body.lang === "en" || body.lang === "uk" ? body.lang : fallbackLang;
  const items = (Array.isArray(body.items) ? body.items : [])
    .slice(0, MAX_ITEMS)
    .map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return {
        name: clip(row.name, 60),
        gift: clip(row.gift, 80),
        validUntil: clip(row.validUntil, 40),
        code: clip(row.code, 24).toUpperCase(),
      };
    });
  return { title: clip(body.title, 60) || LABELS[lang].title, note: clip(body.note, 120), lang, codes: body.codes !== false, items };
}

/** Every row gets a code: the owner's own, or a fresh one. */
export function withCodes(settings: CertificateSettings): CertificateSettings {
  if (!settings.codes) return settings;
  return { ...settings, items: settings.items.map((item) => ({ ...item, code: item.code || newCertificateCode() })) };
}

function xml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The type comes from the bytes, not the name: a painted picture is often PNG saved as still-1.jpg. */
function dataUri(file: string) {
  const bytes = fs.readFileSync(file);
  const mime =
    bytes[0] === 0x89 && bytes[1] === 0x50
      ? "image/png"
      : bytes[0] === 0xff && bytes[1] === 0xd8
        ? "image/jpeg"
        : bytes.subarray(8, 12).toString("latin1") === "WEBP"
          ? "image/webp"
          : "image/png";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function hexOk(hex = "") {
  return /^#[0-9a-f]{6}$/i.test(hex);
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Shrinks a line until it fits the panel (a rough width per character, generous so nothing overflows). */
function fitSize(text: string, size: number, width: number, perChar = 0.56) {
  if (!text) return size;
  return Math.max(28, Math.min(size, Math.floor(width / (text.length * perChar))));
}

/** The page as SVG: the painted design, a quiet panel in the middle, our exact words on it. */
function certificateSvg(settings: CertificateSettings, item: CertificateItem, brand: BrandKit | null, background: string) {
  const L = LABELS[settings.lang];
  const font = brand?.user_id ? brandFont(brand.user_id, brand.font) : null;
  const titleFamily = font ? xml(font.family) : "Montserrat";
  const sans = "Montserrat, Arial, DejaVu Sans, sans-serif";
  const primary = hexOk(brand?.primary_color) ? brand!.primary_color! : "#7a3b1d";
  // A light brand colour (yellow, pastel) does not read on the paper: then the words go dark.
  const accent = luminance(primary) > 0.5 ? "#1a1612" : primary;
  const ink = "#1a1612";
  const muted = "#5c534c";
  const W = PRINT.w;
  const H = PRINT.h;
  const panel = { x: W * 0.17, y: H * 0.16, w: W * 0.66, h: H * 0.68 };
  const cx = W / 2;
  const inner = panel.w * 0.86;
  const parts: string[] = [];
  const top = panel.y + 110;
  let y = top;
  const logo = brand?.user_id ? brandLogoPath(brand.user_id) : "";
  if (logo) {
    parts.push(`<image href="${dataUri(logo)}" x="${cx - 260}" y="${y - 40}" width="520" height="170" preserveAspectRatio="xMidYMid meet"/>`);
    y += 220;
  } else if (brand?.business_name) {
    parts.push(`<text x="${cx}" y="${y + 40}" text-anchor="middle" font-family="${titleFamily}" font-size="${fitSize(brand.business_name, 64, inner)}" fill="${muted}">${xml(clip(brand.business_name, 40))}</text>`);
    y += 120;
  }
  const title = settings.title || L.title;
  parts.push(`<text x="${cx}" y="${y + 60}" text-anchor="middle" font-family="${titleFamily}" font-weight="700" font-size="${fitSize(title, 118, inner, 0.6)}" fill="${accent}">${xml(title)}</text>`);
  y += 190;
  if (item.name) {
    const line = `${L.for}: ${item.name}`;
    parts.push(`<text x="${cx}" y="${y}" text-anchor="middle" font-family="${sans}" font-size="${fitSize(line, 76, inner)}" fill="${ink}">${xml(line)}</text>`);
  } else {
    // No name yet: "For:" and a line to write it by hand.
    parts.push(`<text x="${cx - 330}" y="${y}" text-anchor="end" font-family="${sans}" font-size="64" fill="${ink}">${xml(L.for)}:</text>`);
    parts.push(`<rect x="${cx - 300}" y="${y + 8}" width="${770}" height="4" rx="2" fill="${ink}" fill-opacity="0.55"/>`);
  }
  y += 140;
  if (item.gift) {
    parts.push(`<text x="${cx}" y="${y + 20}" text-anchor="middle" font-family="${sans}" font-weight="800" font-size="${fitSize(item.gift, 110, inner, 0.62)}" fill="${accent}">${xml(item.gift)}</text>`);
    y += 170;
  }
  const meta = [item.validUntil && `${L.valid}: ${item.validUntil}`, settings.codes && item.code && `${L.code}: ${item.code}`].filter(Boolean).join("  ·  ");
  if (meta) {
    parts.push(`<text x="${cx}" y="${y}" text-anchor="middle" font-family="${sans}" font-size="${fitSize(meta, 54, inner)}" fill="${ink}">${xml(meta)}</text>`);
    y += 100;
  }
  if (settings.note) {
    parts.push(`<text x="${cx}" y="${y}" text-anchor="middle" font-family="${sans}" font-size="${fitSize(settings.note, 44, inner)}" fill="${muted}">${xml(settings.note)}</text>`);
    y += 80;
  }
  // The block of words sits in the middle of the design's calm centre, however many lines it has.
  const shift = Math.round(panel.y + panel.h / 2 - (top - 70 + (y - (top - 70)) / 2));
  const words = `<g transform="translate(0 ${shift})">${parts.join("")}</g>`;
  const contact = [brand?.address, brand?.instagram, brand?.website].map((v) => clip(v, 60)).filter(Boolean).join("  ·  ");
  const contactLine = contact
    ? `<text x="${cx}" y="${Math.max(y + shift + 40, panel.y + panel.h - 40)}" text-anchor="middle" font-family="${sans}" font-size="${fitSize(contact, 40, inner)}" fill="${muted}">${xml(contact)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <image href="${background}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  <defs>
    <radialGradient id="wash" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fffdf9" stop-opacity="0.55"/>
      <stop offset="70%" stop-color="#fffdf9" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#fffdf9" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- The words sit on the design's own calm centre; a soft wash only, so they read on any paper tone. -->
  <ellipse cx="${W / 2}" cy="${panel.y + panel.h / 2}" rx="${panel.w * 0.62}" ry="${panel.h * 0.62}" fill="url(#wash)"/>
  ${words}
  ${contactLine}
</svg>`;
}

function run(args: string[]) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/** One page PDF holding the print JPEG edge to edge (A5 landscape). No extra dependency: the format is simple. */
function pdfWithJpeg(jpeg: Buffer, w: number, h: number) {
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Buffer) => {
    const buf = typeof part === "string" ? Buffer.from(part, "latin1") : part;
    chunks.push(buf);
    length += buf.length;
  };
  const object = (n: number, body: (string | Buffer)[]) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    body.forEach(push);
    push("\nendobj\n");
  };
  const draw = `q ${PAGE.w} 0 0 ${PAGE.h} 0 0 cm /Im0 Do Q`;
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  object(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
  object(4, [
    `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    jpeg,
    "\nendstream",
  ]);
  object(5, [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`]);
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

/**
 * One certificate for one person: the painted design with our exact words, as a print PNG, a PDF or a small
 * preview. No AI: free for every person on the list.
 */
export async function renderCertificate(
  projectId: string,
  settings: CertificateSettings,
  index: number,
  brand: BrandKit | null,
  format: "png" | "pdf" | "preview"
) {
  const item = settings.items[index] || { name: "", gift: "", validUntil: "", code: "" };
  const design = stillFile(projectId, 1);
  if (!fs.existsSync(design)) throw Object.assign(new Error("Make the picture first."), { status: 400 });
  const fonts = [...SANS_FONTS];
  const own = brand?.user_id ? brandFont(brand.user_id, brand.font) : null;
  if (own) fonts.unshift(own.file);
  const svg = certificateSvg(settings, item, brand, dataUri(design));
  const width = format === "preview" ? 1240 : PRINT.w;
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: false, fontFiles: fonts, defaultFontFamily: own?.family || "Montserrat" },
  })
    .render()
    .asPng();
  if (format !== "pdf") return { body: Buffer.from(png), mime: "image/png" };
  const dir = projectMediaDir(projectId);
  const tmpPng = path.join(dir, `certificate-${process.pid}-${Date.now()}.png`);
  const tmpJpg = tmpPng.replace(/\.png$/, ".jpg");
  try {
    fs.writeFileSync(tmpPng, png);
    if (!(await run(["-i", tmpPng, "-q:v", "2", tmpJpg])) || !fs.existsSync(tmpJpg)) {
      throw Object.assign(new Error("We couldn’t make the PDF. Try again in a minute."), { status: 500 });
    }
    return { body: pdfWithJpeg(fs.readFileSync(tmpJpg), PRINT.w, PRINT.h), mime: "application/pdf" };
  } finally {
    fs.rmSync(tmpPng, { force: true });
    fs.rmSync(tmpJpg, { force: true });
  }
}
