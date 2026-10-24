import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import type { BrandKit } from "./ai.js";
import { brandFont } from "./brandFont.js";
import { brandLogoPath } from "./brandAssets.js";
import { imageDimensions } from "./imageFormats.js";
import { projectMediaDir, stillFile } from "./media.js";
import { pdfWithJpeg, pngToJpeg } from "./print.js";

/** A5 landscape at 300 dpi: what a print shop expects. */
const PRINT = { w: 2480, h: 1748 };
export const PRINT_HEIGHT = PRINT.h;
/** The same page in PDF points (1/72 inch). */
const PAGE = { w: 595.28, h: 419.53 };
const MAX_ITEMS = 50;

const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../frontend/public/fonts");
const SANS_FONTS = [
  path.join(FONT_DIR, "Montserrat-Bold.ttf"),
  path.join(FONT_DIR, "Montserrat-ExtraBold.ttf"),
  path.join(FONT_DIR, "PlayfairDisplay-Bold.ttf"),
  path.join(FONT_DIR, "CormorantGaramond-Bold.ttf"),
  path.join(FONT_DIR, "GreatVibes-Regular.ttf"),
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
].filter((file) => fs.existsSync(file));

/** gift: the big line ("COMPLIMENTARY COCKTAIL"); giftNote: a smaller line under it ("Enjoy a cocktail on us!"). */
export type CertificateItem = { name: string; gift: string; giftNote: string; validFrom: string; validUntil: string; code: string };
/** codes: print a code on each certificate (made for the empty ones). Off: no code at all. */
/** Where the block of words sits (its centre, as a share of the page) and how big it is (1 = as designed). */
export type CertificateLayout = { x: number; y: number; scale: number };
/**
 * The look of the big words (heading, name, gift): font and two colours. Empty colour = as the studio picks it
 * (brand colour for the heading and gift, near-black for the rest). Small lines (dates, code, note, contacts) stay in
 * Montserrat so they always read; only their colour follows `ink`.
 */
export const CERTIFICATE_FONTS = ["brand", "montserrat", "playfair", "cormorant", "script"] as const;
export type CertificateFont = (typeof CERTIFICATE_FONTS)[number];
export type CertificateStyle = { font: CertificateFont; accent: string; ink: string };
/** Whose logo tops the words: the brand kit's, a file for this certificate only, or none. */
export const CERTIFICATE_LOGOS = ["brand", "own", "none"] as const;
export type CertificateLogo = (typeof CERTIFICATE_LOGOS)[number];
export type CertificateSettings = {
  title: string;
  note: string;
  lang: "uk" | "en";
  codes: boolean;
  layout: CertificateLayout;
  style: CertificateStyle;
  logo: CertificateLogo;
  /** Set once the logo is dragged off the words: its own centre (share of the page) and size; null = above the heading. */
  logoLayout: CertificateLayout | null;
  items: CertificateItem[];
};

/** The logo's space above the heading (print px): the file is fitted into it, proportions kept. */
const LOGO_BOX = { w: 520, h: 170 };
/** Block units the attached logo takes (its box and the gap under it); half of it is how far the words move when it leaves. */
export const LOGO_ROOM = 220;

function logoFit(file: string) {
  const d = imageDimensions(file);
  if (!d?.w || !d?.h) return LOGO_BOX;
  const r = Math.min(LOGO_BOX.w / d.w, LOGO_BOX.h / d.h);
  return { w: d.w * r, h: d.h * r };
}

function parseLogoLayout(raw: unknown): CertificateLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const num = (value: unknown, min: number, max: number, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 1000) / 1000)) : fallback;
  };
  return { x: num(row.x, 0.03, 0.97, 0.5), y: num(row.y, 0.03, 0.97, 0.2), scale: num(row.scale, 0.3, 3, 1) };
}

/** This certificate's own logo (PNG, JPEG or WebP; the type is read from the bytes). */
export function ownLogoFile(projectId: string) {
  return path.join(projectMediaDir(projectId), "cert-logo.img");
}

/**
 * The logo file printed on the certificate, or "" (then the brand name is printed when the brand is used).
 * The brand kit's logo is the owner's own file: it can go on a certificate made without the brand look too.
 */
export function certificateLogoPath(projectId: string, settings: CertificateSettings, ownerId: string) {
  if (settings.logo === "none") return "";
  if (settings.logo === "own") return fs.existsSync(ownLogoFile(projectId)) ? ownLogoFile(projectId) : "";
  return brandLogoPath(ownerId) || "";
}

/** Family names as written inside the font files. */
const FONT_FAMILY: Record<Exclude<CertificateFont, "brand">, string> = {
  montserrat: "Montserrat",
  playfair: "Playfair Display",
  cormorant: "Cormorant Garamond Light",
  script: "Great Vibes",
};

function parseStyle(raw: unknown): CertificateStyle {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const color = (value: unknown) => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "");
  const font = CERTIFICATE_FONTS.includes(row.font as CertificateFont) ? (row.font as CertificateFont) : "brand";
  return { font, accent: color(row.accent), ink: color(row.ink) };
}

export const DEFAULT_LAYOUT: CertificateLayout = { x: 0.5, y: 0.5, scale: 1 };

function parseLayout(raw: unknown): CertificateLayout {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (value: unknown, min: number, max: number, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 1000) / 1000)) : fallback;
  };
  const scale = num(row.scale, 0.5, 1.6, 1);
  // The words never leave the page: the block's half-width (at this size) is the margin.
  const half = Math.min(0.5, (0.66 * 0.86 * scale) / 2);
  return { x: num(row.x, half, 1 - half, 0.5), y: num(row.y, 0.1, 0.9, 0.5), scale };
}

const LABELS = {
  uk: { title: "Подарунковий сертифікат", valid: "Дійсний до", from: "Дійсний з", fromTo: "до", code: "Код" },
  en: { title: "Gift certificate", valid: "Valid until", from: "Valid from", fromTo: "to", code: "Code" },
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

/** defaultLogo: for a certificate never set up — the brand kit's when made with the brand, else none (as it printed before). */
export function parseCertificate(raw: unknown, fallbackLang: "uk" | "en", defaultLogo: CertificateLogo = "brand"): CertificateSettings {
  const body = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof CertificateSettings, unknown>>;
  const lang = body.lang === "en" || body.lang === "uk" ? body.lang : fallbackLang;
  const items = (Array.isArray(body.items) ? body.items : [])
    .slice(0, MAX_ITEMS)
    .map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return {
        name: clip(row.name, 60),
        gift: clip(row.gift, 80),
        giftNote: clip(row.giftNote, 120),
        validFrom: clip(row.validFrom, 40),
        validUntil: clip(row.validUntil, 40),
        code: clip(row.code, 24).toUpperCase(),
      };
    });
  // The standard heading follows the label language; a heading the owner wrote stays as written.
  const title = clip(body.title, 60);
  const standard = !title || Object.values(LABELS).some((labels) => labels.title === title);
  return {
    title: standard ? LABELS[lang].title : title,
    note: clip(body.note, 120),
    lang,
    codes: body.codes !== false,
    layout: parseLayout(body.layout),
    style: parseStyle(body.style),
    logo: CERTIFICATE_LOGOS.includes(body.logo as CertificateLogo) ? (body.logo as CertificateLogo) : defaultLogo,
    logoLayout: parseLogoLayout((body as Record<string, unknown>).logoLayout),
    items,
  };
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
function certificateSvg(settings: CertificateSettings, item: CertificateItem, brand: BrandKit | null, background: string, logo: string) {
  const L = LABELS[settings.lang];
  const style = settings.style || parseStyle(null);
  const font = brand?.user_id ? brandFont(brand.user_id, brand.font) : null;
  const sans = "Montserrat, Arial, DejaVu Sans, sans-serif";
  const display = style.font === "brand" ? (font ? xml(font.family) : "Montserrat") : `${FONT_FAMILY[style.font]}, Montserrat`;
  const titleFamily = display;
  // "Brand font": only the heading, as before (a brand file often has no bold for the gift); the rest stays Montserrat.
  const wordsFamily = style.font === "brand" ? sans : display;
  // A script face is lovely big and hard to read small: the line under the gift stays plain then.
  const noteFamily = style.font === "script" ? sans : wordsFamily;
  // Script letters are small for their size: the big lines get a little larger.
  const big = style.font === "script" ? 1.2 : 1;
  const primary = hexOk(brand?.primary_color) ? brand!.primary_color! : "#7a3b1d";
  // A light brand colour (yellow, pastel) does not read on the paper: then the words go dark.
  const accent = style.accent || (luminance(primary) > 0.5 ? "#1a1612" : primary);
  const ink = style.ink || "#1a1612";
  const muted = style.ink ? style.ink : "#5c534c";
  const mutedOpacity = style.ink ? ' fill-opacity="0.8"' : "";
  // Light words (white, gold) need a dark wash under them instead of the light one.
  const washColor = luminance(ink) > 0.6 ? "#1a1612" : "#fffdf9";
  const W = PRINT.w;
  const H = PRINT.h;
  const panel = { x: W * 0.17, y: H * 0.16, w: W * 0.66, h: H * 0.68 };
  const cx = W / 2;
  const inner = panel.w * 0.86;
  const parts: string[] = [];
  const top = panel.y + 110;
  let y = top;
  const loose = Boolean(logo && settings.logoLayout);
  if (logo && !loose) {
    parts.push(`<image href="${dataUri(logo)}" x="${cx - LOGO_BOX.w / 2}" y="${y - 40}" width="${LOGO_BOX.w}" height="${LOGO_BOX.h}" preserveAspectRatio="xMidYMid meet"/>`);
    y += LOGO_ROOM;
  } else if (settings.logo === "brand" && brand?.business_name) {
    parts.push(`<text x="${cx}" y="${y + 40}" text-anchor="middle" font-family="${titleFamily}" font-size="${fitSize(brand.business_name, 64, inner)}" fill="${muted}"${mutedOpacity}>${xml(clip(brand.business_name, 40))}</text>`);
    y += 120;
  }
  const title = settings.title || L.title;
  parts.push(`<text x="${cx}" y="${y + 60}" text-anchor="middle" font-family="${titleFamily}" font-weight="700" font-size="${fitSize(title, 118 * big, inner, 0.6 / big)}" fill="${accent}">${xml(title)}</text>`);
  y += 190;
  if (item.name) {
    parts.push(`<text x="${cx}" y="${y}" text-anchor="middle" font-family="${wordsFamily}" font-size="${fitSize(item.name, 80 * big, inner, 0.56 / big)}" fill="${ink}">${xml(item.name)}</text>`);
  } else {
    // No name yet: a line to write it by hand.
    parts.push(`<rect x="${cx - 420}" y="${y + 8}" width="840" height="4" rx="2" fill="${ink}" fill-opacity="0.55"/>`);
  }
  y += 140;
  if (item.gift) {
    parts.push(`<text x="${cx}" y="${y + 20}" text-anchor="middle" font-family="${wordsFamily}" font-weight="800" font-size="${fitSize(item.gift, 110 * big, inner, 0.62 / big)}" fill="${accent}">${xml(item.gift)}</text>`);
    y += item.giftNote ? 120 : 170;
  }
  if (item.giftNote) {
    parts.push(`<text x="${cx}" y="${y}" text-anchor="middle" font-family="${noteFamily}" font-size="${fitSize(item.giftNote, 58, inner)}" fill="${ink}">${xml(item.giftNote)}</text>`);
    y += 120;
  }
  const dates = item.validFrom
    ? item.validUntil
      ? `${L.from} ${item.validFrom} ${L.fromTo} ${item.validUntil}`
      : `${L.from} ${item.validFrom}`
    : item.validUntil
      ? `${L.valid}: ${item.validUntil}`
      : "";
  const meta = [dates, settings.codes && item.code && `${L.code}: ${item.code}`].filter(Boolean).join("  ·  ");
  if (meta) {
    parts.push(`<text x="${cx}" y="${y}" text-anchor="middle" font-family="${sans}" font-size="${fitSize(meta, 54, inner)}" fill="${ink}">${xml(meta)}</text>`);
    y += 100;
  }
  if (settings.note) {
    parts.push(`<text x="${cx}" y="${y}" text-anchor="middle" font-family="${sans}" font-size="${fitSize(settings.note, 44, inner)}" fill="${muted}"${mutedOpacity}>${xml(settings.note)}</text>`);
    y += 80;
  }
  const contact = [brand?.address, brand?.instagram, brand?.website].map((v) => clip(v, 60)).filter(Boolean).join("  ·  ");
  if (contact) {
    parts.push(`<text x="${cx}" y="${y + 20}" text-anchor="middle" font-family="${sans}" font-size="${fitSize(contact, 40, inner)}" fill="${muted}"${mutedOpacity}>${xml(contact)}</text>`);
    y += 80;
  }
  // The whole block of words — at the place and size the owner dragged it to (the middle of the page by default).
  const layout = settings.layout || DEFAULT_LAYOUT;
  const start = top - 70;
  const middle = (start + y) / 2;
  const at = { x: Math.round(layout.x * W), y: Math.round(layout.y * H) };
  const words = `<g transform="translate(${at.x} ${at.y}) scale(${layout.scale}) translate(${-cx} ${-Math.round(middle)})">${parts.join("")}</g>`;
  // A logo dragged off the words: on its own, where the owner put it.
  let looseLogo = "";
  if (loose && settings.logoLayout) {
    const fit = logoFit(logo);
    const w = Math.round(fit.w * settings.logoLayout.scale);
    const h = Math.round(fit.h * settings.logoLayout.scale);
    const lx = Math.round(settings.logoLayout.x * W - w / 2);
    const ly = Math.round(settings.logoLayout.y * H - h / 2);
    looseLogo = `<image href="${dataUri(logo)}" x="${lx}" y="${ly}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const wash = { rx: Math.round(panel.w * 0.62 * layout.scale), ry: Math.round(Math.max(panel.h * 0.62, (y - start) * 0.75) * layout.scale) };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <image href="${background}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  <defs>
    <radialGradient id="wash" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${washColor}" stop-opacity="0.55"/>
      <stop offset="70%" stop-color="${washColor}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${washColor}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- The words sit on the design's own calm centre; a soft wash only, so they read on any paper tone. -->
  <ellipse cx="${at.x}" cy="${at.y}" rx="${wash.rx}" ry="${wash.ry}" fill="url(#wash)"/>
  ${words}
  ${looseLogo}
</svg>`;
}

/** How big the block of words is (share of the page width and height, before the owner's scale) — for the drag frame. */
export function certificateBlockBox(settings: CertificateSettings, item: CertificateItem, brand: BrandKit | null, logo: string) {
  let h = 70;
  if (logo && !settings.logoLayout) h += LOGO_ROOM;
  else if (settings.logo === "brand" && brand?.business_name) h += 120;
  h += 190 + 140;
  if (item.gift) h += item.giftNote ? 120 : 170;
  if (item.giftNote) h += 120;
  if (item.validFrom || item.validUntil || (settings.codes && item.code)) h += 100;
  if (settings.note) h += 80;
  if ([brand?.address, brand?.instagram, brand?.website].some((v) => String(v || "").trim())) h += 80;
  return { w: 0.66 * 0.86, h: Math.round((h / PRINT.h) * 1000) / 1000 };
}

/** Where the logo is on the page (centre and size, shares of the page) — for its drag frame; null when none prints. */
export function certificateLogoBox(settings: CertificateSettings, item: CertificateItem, brand: BrandKit | null, logo: string) {
  if (!logo) return null;
  const fit = logoFit(logo);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  if (settings.logoLayout) {
    const l = settings.logoLayout;
    return { x: l.x, y: l.y, w: round((fit.w * l.scale) / PRINT.w), h: round((fit.h * l.scale) / PRINT.h) };
  }
  // Above the heading: its centre sits 115 block units below the block's top (the block starts 70 above the first line).
  const layout = settings.layout || DEFAULT_LAYOUT;
  const blockH = certificateBlockBox(settings, item, brand, logo).h * PRINT.h;
  return {
    x: layout.x,
    y: round(layout.y + ((115 - blockH / 2) * layout.scale) / PRINT.h),
    w: round((fit.w * layout.scale) / PRINT.w),
    h: round((fit.h * layout.scale) / PRINT.h),
  };
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
  format: "png" | "pdf" | "preview",
  ownerId: string
) {
  const item = settings.items[index] || { name: "", gift: "", giftNote: "", validFrom: "", validUntil: "", code: "" };
  const design = stillFile(projectId, 1);
  if (!fs.existsSync(design)) throw Object.assign(new Error("Make the picture first."), { status: 400 });
  const fonts = [...SANS_FONTS];
  const own = brand?.user_id ? brandFont(brand.user_id, brand.font) : null;
  if (own) fonts.unshift(own.file);
  const svg = certificateSvg(settings, item, brand, dataUri(design), certificateLogoPath(projectId, settings, ownerId));
  const width = format === "preview" ? 1240 : PRINT.w;
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: false, fontFiles: fonts, defaultFontFamily: own?.family || "Montserrat" },
  })
    .render()
    .asPng();
  if (format !== "pdf") return { body: Buffer.from(png), mime: "image/png" };
  const jpeg = await pngToJpeg(Buffer.from(png), projectMediaDir(projectId));
  return { body: pdfWithJpeg(jpeg, PRINT.w, PRINT.h, PAGE), mime: "application/pdf" };
}
