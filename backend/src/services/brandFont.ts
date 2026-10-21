import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { brandFontPath, brandFontSamplePath, brandWordmarkPath, hasBrandFont } from "./brandAssets.js";

const builtinDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../frontend/public/fonts");

/** Title fonts we ship (OFL). The Brand Kit list offers these; the files also serve the preview. */
const BUILTIN_FONTS: Record<string, string> = {
  Nunito: "Nunito-Regular.ttf",
  Montserrat: "Montserrat-Regular.ttf",
};

export function builtinFontFile(name = "") {
  const file = BUILTIN_FONTS[name] ? path.join(builtinDir, BUILTIN_FONTS[name]) : "";
  return file && fs.existsSync(file) ? file : "";
}

/** Heavy weights for burned-in Reel captions (OFL, Latin and Cyrillic). */
export function captionFontFile(weight: "bold" | "extrabold") {
  const file = path.join(builtinDir, weight === "bold" ? "Montserrat-Bold.ttf" : "Montserrat-ExtraBold.ttf");
  return fs.existsSync(file) ? file : "";
}

export function hasTitleFont(userId: string, fontName = "") {
  return hasBrandFont(userId) || Boolean(builtinFontFile(fontName));
}

function utf16be(raw: Buffer) {
  let out = "";
  for (let i = 0; i + 1 < raw.length; i += 2) out += String.fromCharCode(raw.readUInt16BE(i));
  return out;
}

/** Family name from the font's own `name` table — the name the renderer matches on. */
export function fontFamilyName(buffer: Buffer) {
  try {
    const numTables = buffer.readUInt16BE(4);
    for (let i = 0; i < numTables; i++) {
      const record = 12 + i * 16;
      if (buffer.toString("latin1", record, record + 4) !== "name") continue;
      const table = buffer.readUInt32BE(record + 8);
      const count = buffer.readUInt16BE(table + 2);
      const strings = table + buffer.readUInt16BE(table + 4);
      const found: Record<number, string> = {};
      for (let j = 0; j < count; j++) {
        const entry = table + 6 + j * 12;
        const platform = buffer.readUInt16BE(entry);
        const nameId = buffer.readUInt16BE(entry + 6);
        if ((nameId !== 1 && nameId !== 16) || found[nameId]) continue;
        const length = buffer.readUInt16BE(entry + 8);
        const offset = strings + buffer.readUInt16BE(entry + 10);
        const raw = buffer.subarray(offset, offset + length);
        const text = (platform === 1 ? raw.toString("latin1") : utf16be(raw)).trim();
        if (text) found[nameId] = text;
      }
      return (found[16] || found[1] || "").replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 60);
    }
  } catch {
    return "";
  }
  return "";
}

function xmlEscape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function render(svg: string, fontFile: string, family: string) {
  return new Resvg(svg, { font: { loadSystemFonts: false, fontFiles: [fontFile], defaultFontFamily: family } });
}

export function brandFont(userId: string, fontName = "") {
  const file = hasBrandFont(userId) ? brandFontPath(userId) : builtinFontFile(fontName);
  if (!file) return null;
  const family = fontFamilyName(fs.readFileSync(file));
  return family ? { file, family } : null;
}

/** A specimen sheet the picture model copies the letter shapes from. */
export function writeFontSample(userId: string, businessName = "", fontName = "") {
  const font = brandFont(userId, fontName);
  if (!font) {
    fs.rmSync(brandFontSamplePath(userId), { force: true });
    return "";
  }
  const family = xmlEscape(font.family);
  const name = xmlEscape(businessName.replace(/\s+/g, " ").trim().slice(0, 40) || "Aa Bb Cc");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512" viewBox="0 0 1024 512">
  <rect width="1024" height="512" fill="#ffffff"/>
  <text x="60" y="150" font-family="${family}" font-size="104" fill="#111111">${name}</text>
  <text x="60" y="290" font-family="${family}" font-size="72" fill="#111111">Aa Bb Cc Gg 123</text>
  <text x="60" y="420" font-family="${family}" font-size="72" fill="#111111">Аа Бб Вв Її Ґґ</text>
</svg>`;
  try {
    const png = render(svg, font.file, font.family).render().asPng();
    fs.writeFileSync(brandFontSamplePath(userId), png);
    return brandFontSamplePath(userId);
  } catch (error) {
    console.error("font sample failed", error instanceof Error ? error.message : error);
    return "";
  }
}

export function fontSampleFile(userId: string, businessName = "", fontName = "") {
  const file = brandFontSamplePath(userId);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  return writeFontSample(userId, businessName, fontName);
}

/** The business name set in the owner's font, on a soft pill — stamped where a logo would go. */
export function writeWordmark(userId: string, businessName: string, ink: string, paper: string, fontName = "") {
  const font = brandFont(userId, fontName);
  const text = businessName.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!font || !text) return "";
  const family = xmlEscape(font.family);
  const size = 72;
  const word = `<text x="0" y="${size}" font-family="${family}" font-size="${size}" fill="${ink}">${xmlEscape(text)}</text>`;
  try {
    const probe = render(`<svg xmlns="http://www.w3.org/2000/svg" width="${text.length * size + 200}" height="${size * 2}">${word}</svg>`, font.file, font.family);
    const box = probe.getBBox();
    if (!box || box.width <= 0) return "";
    const padX = 36;
    const padY = 22;
    const width = Math.ceil(box.width + padX * 2);
    const height = Math.ceil(box.height + padY * 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="${Math.round(height / 2)}" fill="${paper}" fill-opacity="0.9"/>
  <g transform="translate(${padX - box.x} ${padY - box.y})">${word}</g>
</svg>`;
    const png = render(svg, font.file, font.family).render().asPng();
    fs.writeFileSync(brandWordmarkPath(userId), png);
    return brandWordmarkPath(userId);
  } catch (error) {
    console.error("wordmark failed", error instanceof Error ? error.message : error);
    return "";
  }
}
