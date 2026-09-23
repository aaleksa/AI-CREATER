import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { BrandKit, PosterArt } from "./ai.js";
import type { InviteCard, InviteItem } from "./invite.js";
import { guessInvite } from "./invite.js";
import { stillBgFile, stillFile, writeStillFromPng } from "./media.js";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrap(text: string, max = 22, limit = 3) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const chunks = word.length > max ? word.match(new RegExp(`.{1,${max}}`, "g")) || [word] : [word];
    for (const chunk of chunks) {
      const next = current ? `${current} ${chunk}` : chunk;
      if (next.length > max && current) {
        lines.push(current);
        current = chunk;
      } else current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, Math.max(1, limit));
}

function fit(text: string, maxWidth: number, fontSize: number, maxLines = 3) {
  if (!text) return { lines: [] as string[], size: fontSize };
  let size = fontSize;
  const cyr = hasCyrillic(text);
  for (let step = 0; step < 6; step += 1) {
    const em = cyr ? 0.62 : 0.52;
    const maxChars = Math.max(8, Math.floor(maxWidth / (size * em)));
    const all = wrap(text, maxChars, 12);
    if (all.length <= maxLines || size <= 13) {
      const lines = all.slice(0, maxLines);
      if (all.length > maxLines && lines.length) {
        const last = lines[lines.length - 1];
        lines[lines.length - 1] = last.length > 3 ? `${last.slice(0, Math.max(3, last.length - 1))}…` : `${last}…`;
      }
      return { lines, size };
    }
    size -= 2;
  }
  return { lines: wrap(text, 18, maxLines), size: 13 };
}

function hasCyrillic(...values: string[]) {
  return values.some((value) => /[А-Яа-яІіЇїЄєҐґ]/.test(value));
}

function inviteFonts(_cyrillic: boolean) {
  const latin = [
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/System/Library/Fonts/NewYork.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
  ];
  const unicode = [
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ];
  return [...unicode, ...latin].filter((file) => fs.existsSync(file));
}

function hexLum(color: string) {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return 1;
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function paperColor(brand?: BrandKit | null) {
  const color = brand?.secondary_color || "";
  return hexLum(color) > 0.75 && color ? color : "#F6F1E8";
}

function lineBlock(lines: string[], x: number, y: number, size: number, fill: string, weight = 500, anchor = "start") {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * (size + 8)}" text-anchor="${anchor}" font-family="Arial Unicode MS, Arial, Georgia, DejaVu Serif, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
    )
    .join("");
}

function iconKind(title: string) {
  if (/йога|yoga|lotus|розтяж/i.test(title)) return "yoga";
  if (/танц|dance|рух/i.test(title)) return "dance";
  if (/термо|therm|кулін|cook|їж|їжа|кава|coffee|кухн/i.test(title)) return "cook";
  if (/сюрприз|gift|подарунок|surprise/i.test(title)) return "gift";
  if (/майстер|class|workshop|лекц|talk|зустріч/i.test(title)) return "workshop";
  if (/чай|tea|спа|spa|масаж/i.test(title)) return "tea";
  if (/музик|music|співа/i.test(title)) return "music";
  return "leaf";
}

function stillDataUrl(projectId: string, sceneId: number) {
  const file = stillFile(projectId, sceneId);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) return "";
  return `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
}

function programShot(cx: number, cy: number, ink: string, photo: string, kind: string) {
  if (photo) {
    const clip = `shot-${Math.round(cx)}-${Math.round(cy)}`;
    return `<defs><clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="52"/></clipPath></defs>
      <image href="${photo}" x="${cx - 52}" y="${cy - 52}" width="104" height="104" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>
      <circle cx="${cx}" cy="${cy}" r="52" fill="none" stroke="${ink}" stroke-opacity="0.14"/>`;
  }
  return programIcon(kind, cx, cy, ink);
}

function programIcon(kind: string, cx: number, cy: number, ink: string) {
  const disc = `<circle cx="${cx}" cy="${cy}" r="34" fill="#F4E0E4"/><circle cx="${cx}" cy="${cy}" r="33" fill="none" stroke="${ink}" stroke-opacity="0.08"/>`;
  if (kind === "yoga") {
    return `${disc}<path d="M${cx} ${cy + 10} v-16 M${cx - 11} ${cy + 2} q11 -16 22 0" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy - 12}" r="3.5" fill="${ink}"/>`;
  }
  if (kind === "cook") {
    return `${disc}<path d="M${cx - 12} ${cy + 6} h24 v4 a12 8 0 0 1 -24 0 z" fill="none" stroke="${ink}" stroke-width="2.2"/><path d="M${cx} ${cy - 14} v12" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
  }
  if (kind === "dance") {
    return `${disc}<path d="M${cx - 8} ${cy + 10} l8 -18 l8 18 M${cx} ${cy - 8} v-6" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/><circle cx="${cx}" cy="${cy - 16}" r="3.2" fill="${ink}"/>`;
  }
  if (kind === "gift") {
    return `${disc}<rect x="${cx - 11}" y="${cy - 4}" width="22" height="16" rx="2" fill="none" stroke="${ink}" stroke-width="2.2"/><path d="M${cx} ${cy - 4} v16 M${cx - 11} ${cy + 4} h22 M${cx - 6} ${cy - 10} q6 6 12 0" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
  }
  if (kind === "workshop") {
    return `${disc}<rect x="${cx - 12}" y="${cy - 8}" width="24" height="18" rx="2" fill="none" stroke="${ink}" stroke-width="2.2"/><path d="M${cx - 8} ${cy - 2} h16 M${cx - 8} ${cy + 4} h10" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`;
  }
  if (kind === "tea") {
    return `${disc}<path d="M${cx - 10} ${cy + 2} h16 a8 8 0 0 1 0 10 h-16 a8 8 0 0 1 0 -10z" fill="none" stroke="${ink}" stroke-width="2.2"/><path d="M${cx + 6} ${cy + 4} q8 2 0 8" fill="none" stroke="${ink}" stroke-width="2"/>`;
  }
  if (kind === "music") {
    return `${disc}<circle cx="${cx - 6}" cy="${cy + 8}" r="3.2" fill="${ink}"/><path d="M${cx - 3} ${cy + 8} v-18 l14 3 v15" fill="none" stroke="${ink}" stroke-width="2.2"/><circle cx="${cx + 11}" cy="${cy + 8}" r="3.2" fill="${ink}"/>`;
  }
  return `${disc}<path d="M${cx} ${cy + 12} c-10 -16 -2 -24 0 -28 c2 4 10 12 0 28 z" fill="none" stroke="${ink}" stroke-width="2.2"/>`;
}

function ornaments(accent: string) {
  return `<g fill="none" stroke="${accent}" stroke-opacity="0.28" stroke-width="1.5" stroke-linecap="round">
    <path d="M48 36 c28 8 42 32 14 58 c-8-22-28-32-14-58z"/><path d="M78 58 c14 6 12 20 -2 24"/>
    <path d="M36 86 c18 4 16 22 -4 20"/>
    <path d="M1034 40 c-30 10-44 34-16 58 c9-22 28-32 16-58z"/><path d="M1002 64 c-14 6-12 20 2 24"/>
    <path d="M70 1280 c20 -18 36 2 18 22 c-4-12-16-16-18-22z"/>
    <path d="M1010 1274 c-18 -12 -28 8 -10 22"/>
    <circle cx="540" cy="46" r="3.5" fill="${accent}" stroke="none" opacity="0.32"/>
    <circle cx="558" cy="46" r="2.2" fill="${accent}" stroke="none" opacity="0.2"/>
    <circle cx="522" cy="46" r="2.2" fill="${accent}" stroke="none" opacity="0.2"/>
  </g>`;
}

function photoGround(background: string | undefined, paper: string) {
  if (!background) return `<rect width="1080" height="1350" fill="${paper}"/>`;
  return `<image href="${background}" x="0" y="0" width="1080" height="1350" preserveAspectRatio="xMidYMid slice"/>
    <rect width="1080" height="1350" fill="${paper}" fill-opacity="0.42"/>
    <defs>
      <linearGradient id="read" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${paper}" stop-opacity="0.55"/>
        <stop offset="0.38" stop-color="${paper}" stop-opacity="0.12"/>
        <stop offset="0.78" stop-color="${paper}" stop-opacity="0.18"/>
        <stop offset="1" stop-color="${paper}" stop-opacity="0.62"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="url(#read)"/>`;
}

function buildFlyer(invite: InviteCard, brand?: BrandKit | null, background?: string, shots: string[] = []) {
  const ink = "#2C382C";
  const mute = "#3F463C";
  const paper = paperColor(brand);
  const accent = brand?.primary_color || "#3D5A40";
  const cyr = hasCyrillic(invite.name, invite.intro, invite.closing, invite.address, ...invite.program.map((item) => item.title + item.detail));
  const programme = cyr ? "У програмі" : "Programme";
  const brandName = brand?.business_name || "";
  const title = fit(invite.name, 500, 52, 3);
  const lede = fit(invite.lines[0] || (invite.intro || "").split(/[.!?]/)[0] || "", 500, 20, 2);
  const intro = fit(invite.intro || "", 500, 17, 4);
  let y = 96;
  const titleSvg = lineBlock(title.lines, 56, y, title.size, ink, 650);
  y += title.lines.length * (title.size + 8) + 10;
  const ledeSvg = lineBlock(lede.lines, 56, y, lede.size, mute, 500);
  y += lede.lines.length * (lede.size + 8) + 10;
  const introSvg = lineBlock(intro.lines, 56, y, intro.size, ink, 500);

  const textX = 560;
  let itemY = 108;
  const head = `<text x="${textX}" y="${itemY}" font-size="18" font-weight="600" fill="${ink}">${escapeXml(programme)}</text>`;
  itemY += 46;
  const items = invite.program
    .map((item: InviteItem, index) => {
      const titleFit = fit(item.title, 340, 19, 2);
      const detailFit = fit(item.detail, 340, 14, 2);
      const timeW = Math.max(86, item.time.length * 9 + 24);
      const shot = programShot(textX + 32, itemY + 20, ink, shots[index] || "", iconKind(item.title));
      const time = item.time
        ? `<rect x="${textX + 96}" y="${itemY - 12}" width="${timeW}" height="24" rx="12" fill="${paper}" fill-opacity="0.86"/><text x="${textX + 96 + timeW / 2}" y="${itemY + 5}" text-anchor="middle" font-size="13" font-weight="650" fill="${accent}">${escapeXml(item.time)}</text>`
        : "";
      const copyX = textX + 96;
      const headY = itemY + (item.time ? 28 : 6);
      const names = lineBlock(titleFit.lines, copyX, headY, titleFit.size, ink, 600);
      const details = lineBlock(detailFit.lines, copyX, headY + titleFit.lines.length * (titleFit.size + 5) + 4, detailFit.size, mute, 500);
      const height = Math.max(88, 20 + (item.time ? 26 : 0) + titleFit.lines.length * (titleFit.size + 5) + detailFit.lines.length * (detailFit.size + 5) + 16);
      itemY += height;
      return `${shot}${time}${names}${details}`;
    })
    .join("");

  const footBits = [
    [invite.date, invite.time].filter(Boolean).join("  ·  "),
    [invite.place, invite.address].filter(Boolean).join("  ·  "),
    invite.closing,
  ].filter(Boolean);
  const foot = footBits
    .map((line, index) => lineBlock(fit(line, 960, 16, 1).lines, 56, 1284 + index * 20, 16, index === 2 ? mute : ink, 500))
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  ${photoGround(background, paper)}
  ${ornaments(accent)}
  ${titleSvg}
  ${ledeSvg}
  ${introSvg}
  ${head}
  ${items}
  ${foot}
  ${brandName ? `<text x="1024" y="1334" text-anchor="end" font-size="14" fill="${accent}">${escapeXml(brandName)}</text>` : ""}
</svg>`;
}

function buildCard(invite: InviteCard, brand?: BrandKit | null, background?: string) {
  const ink = "#2C382C";
  const mute = "#3F463C";
  const paper = paperColor(brand);
  const accent = brand?.primary_color || "#3D5A40";
  const brandName = brand?.business_name || "";
  const title = fit(invite.name, 960, 52, 3);
  let cursor = 100;
  const titleSvg = lineBlock(title.lines, 56, cursor, title.size, ink, 650);
  cursor += title.lines.length * (title.size + 10) + 12;
  const intro = fit(invite.intro || invite.lines[0] || "", 960, 20, 4);
  const introSvg = lineBlock(intro.lines, 56, cursor, intro.size, mute, 500);
  cursor += intro.lines.length * (intro.size + 8) + 8;
  const extra = invite.lines
    .slice(invite.intro ? 0 : 1, 3)
    .map((line) => {
      const rows = fit(line, 960, 18, 2);
      const svg = lineBlock(rows.lines, 56, cursor, rows.size, mute, 500);
      cursor += rows.lines.length * (rows.size + 8) + 6;
      return svg;
    })
    .join("");
  const foot = [
    [invite.date, invite.time].filter(Boolean).join("  ·  "),
    [invite.place, invite.address].filter(Boolean).join(" · "),
    invite.closing,
  ].filter(Boolean);
  const footer = foot
    .map((line, index) => lineBlock(fit(line, 960, 16, 1).lines, 56, 1284 + index * 20, 16, ink, 500))
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  ${photoGround(background, paper)}
  ${ornaments(accent)}
  ${titleSvg}
  ${introSvg}
  ${extra}
  ${footer}
  ${brandName ? `<text x="1024" y="1334" text-anchor="end" font-size="14" fill="${accent}">${escapeXml(brandName)}</text>` : ""}
</svg>`;
}

function buildSvg(invite: InviteCard, brand?: BrandKit | null, background?: string, shots: string[] = []) {
  return invite.program.length >= 2 ? buildFlyer(invite, brand, background, shots) : buildCard(invite, brand, background);
}

export function captureInviteBackground(projectId: string) {
  const live = stillFile(projectId, 1);
  if (fs.existsSync(live) && fs.statSync(live).size > 0) {
    fs.copyFileSync(live, stillBgFile(projectId));
  }
}

export async function composeInvitePoster(projectId: string, invite: InviteCard, brand?: BrandKit | null) {
  const bgPath = stillBgFile(projectId);
  const live = stillFile(projectId, 1);
  if (!fs.existsSync(bgPath) && fs.existsSync(live) && fs.statSync(live).size > 0) {
    fs.copyFileSync(live, bgPath);
  }
  let background = "";
  if (fs.existsSync(bgPath) && fs.statSync(bgPath).size > 0) {
    const bytes = fs.readFileSync(bgPath);
    background = `data:image/jpeg;base64,${bytes.toString("base64")}`;
  }
  const shots = [2, 3, 4].map((sceneId) => stillDataUrl(projectId, sceneId));
  const svg = buildSvg(invite, brand, background, shots);
  const fonts = inviteFonts(
    hasCyrillic(invite.name, invite.date, invite.place, invite.address, invite.intro, invite.closing, ...invite.lines, ...invite.program.flatMap((item) => [item.title, item.detail]))
  );
  const renderer = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
    font: fonts.length
      ? { fontFiles: fonts, defaultFontFamily: path.parse(fonts[0]).name.replace(" Bold", "") }
      : undefined,
  });
  await writeStillFromPng(projectId, 1, renderer.render().asPng());
  return stillFile(projectId, 1);
}

function wrapWords(text: string, maxChars: number) {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const pieces = word.length > maxChars ? word.match(new RegExp(`.{1,${maxChars}}`, "g")) || [word] : [word];
    for (const piece of pieces) {
      const next = current ? `${current} ${piece}` : piece;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = piece;
      } else current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function allLines(text: string, maxWidth: number, size: number) {
  if (!text) return [] as string[];
  const em = hasCyrillic(text) ? 0.62 : 0.54;
  return wrapWords(text, Math.max(8, Math.floor(maxWidth / (size * em))));
}

function printable(value: unknown) {
  return String(value || "")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[·•◦▪●]/g, "-")
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{200B}]/gu, " ")
    .replace(/[^\x20-\x7E\u00C0-\u024F\u0400-\u04FF\u0500-\u052FІіЇїЄєҐґ'".:,;!?()\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function recoverPhrase(raw: string, brief: string) {
  const text = printable(raw);
  if (!text) return "";
  const compact = text.replace(/\s+/g, "").toLowerCase();
  const words = printable(brief).split(" ").filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    for (let j = i + 1; j <= Math.min(words.length, i + 10); j += 1) {
      const slice = words.slice(i, j).join(" ");
      if (slice.replace(/\s+/g, "").toLowerCase() === compact) return slice;
    }
  }
  return unfuse(text);
}

function unfuse(text: string) {
  return text
    .replace(/PAUSEFOR/gi, "PAUSE FOR")
    .replace(/FORYOURSELF/gi, "FOR YOURSELF")
    .replace(/TAKECARE/gi, "TAKE CARE")
    .replace(/SELFCARE/gi, "SELF-CARE")
    .replace(/WOMENET'?S|WOMEN'S/gi, "Women's")
    .replace(/RETREATREAT/gi, "Retreat")
    .replace(/LONDONO+N/gi, "London")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b(PAUSE|CARE|TIME|DAY)(FOR|OF|TO|YOUR|SELF)/gi, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function stackTitle(name: string) {
  const words = unfuse(name).split(" ").filter(Boolean);
  if (words.length <= 3) return words;
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 12 && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function fontSetup(files: string[]) {
  const named = files[0] ? path.parse(files[0]).name.replace(" Bold", "") : "Arial Unicode MS";
  const family = /unicode/i.test(named) ? "Arial Unicode MS" : named;
  return {
    loadSystemFonts: true,
    fontFiles: files,
    defaultFontFamily: family,
  };
}

function betterCopy(ai: string, guessed: string, brief: string) {
  const fromBrief = recoverPhrase(ai, brief);
  const g = printable(guessed);
  const a = printable(fromBrief || ai);
  if (!a) return g;
  if (!g) return a;
  const spaces = (value: string) => (value.match(/ /g) || []).length;
  return spaces(g) >= spaces(a) ? g : a;
}

function mergeInvite(art: PosterArt, brief: string): InviteCard {
  const guessed = guessInvite(brief);
  const program = (guessed.program.length ? guessed.program : art.program || []).map((item) => ({
    time: printable(item.time),
    title: recoverPhrase(item.title, brief) || printable(item.title),
    detail: recoverPhrase(item.detail, brief) || printable(item.detail),
  }));
  return {
    name: unfuse(betterCopy(art.headline, guessed.name, brief) || guessed.name),
    date: guessed.date,
    time: guessed.time,
    place: guessed.place,
    address: guessed.address,
    intro: guessed.intro || recoverPhrase((art.lines || [])[0] || "", brief),
    closing: betterCopy(art.closing, guessed.closing, brief),
    lines: (guessed.lines.length ? guessed.lines : art.lines || []).map((line) => recoverPhrase(line, brief)).filter(Boolean),
    program: program.filter((item) => item.time || item.title).slice(0, 6),
  };
}

function buildChatFlyer(invite: InviteCard, brand?: BrandKit | null, background = "", uk = false) {
  const W = 1080;
  const H = 1350;
  const ink = "#2C382C";
  const mute = "#4A5348";
  const paper = "#F6F1E8";
  const blush = "#F3E0E4";
  const accent = brand?.primary_color && hexLum(brand.primary_color) < 0.7 ? brand.primary_color : "#3D5A40";
  const programme = uk ? "У програмі" : "Programme";
  const headline = unfuse(invite.name || (uk ? "Запрошення" : "You're invited"));
  const titleLines = stackTitle(headline);
  const titleSize = titleLines.length > 3 ? 42 : 56;
  const tag = allLines(unfuse(invite.closing || (uk ? "Час для себе" : "Take care of yourself")), 280, 16);
  const sub = unfuse(invite.lines[0] || "");
  const subLines = allLines(sub, 430, 20);
  const lede = allLines(unfuse(invite.intro), 430, 16);
  const extra = invite.lines.slice(1, 4).map((line) => allLines(unfuse(line), 430, 16));

  let leftY = 92 + titleLines.length * (titleSize + 6) + 36;
  const subBlock = sub
    ? `<rect x="48" y="${leftY - 28}" width="${Math.min(470, 48 + subLines[0].length * 11)}" height="${subLines.length * 28 + 28}" rx="18" fill="${blush}"/>
       ${lineBlock(subLines, 68, leftY, 20, ink, 600)}`
    : "";
  if (sub) leftY += subLines.length * 28 + 36;
  const introSvg = lineBlock(lede, 56, leftY, 16, mute, 500);
  leftY += lede.length * 24 + 18;
  const extraSvg = extra
    .map((lines) => {
      if (leftY + lines.length * 24 > 860) return "";
      const svg = lineBlock(lines, 56, leftY, 16, mute, 500);
      leftY += lines.length * 24 + 10;
      return svg;
    })
    .join("");

  const foot = [invite.date, [invite.place, invite.address].filter(Boolean).join(", "), invite.closing].filter(Boolean);
  const footH = Math.max(56, 28 + foot.length * 22);
  const contentBottom = H - footH - 24;
  const programBottom = contentBottom - 8;

  let itemY = 300;
  const rawHeights = invite.program.map((item) => {
    const names = allLines(item.title, 300, 17);
    const details = allLines(item.detail, 300, 13);
    return Math.max(78, 32 + names.length * 22 + details.length * 18);
  });
  const rawTotal = rawHeights.reduce((sum, h) => sum + h, 0);
  const room = Math.max(120, programBottom - itemY);
  const shrink = rawTotal > room ? room / rawTotal : 1;

  const programSvg = invite.program
    .map((item: InviteItem, index) => {
      const names = allLines(unfuse(item.title), 300, shrink < 0.9 ? 14 : 17);
      const details = allLines(unfuse(item.detail), 300, shrink < 0.9 ? 12 : 13);
      const icon = programIcon(iconKind(item.title), 612, itemY + 16, ink);
      const time = item.time
        ? `<text x="682" y="${itemY + 2}" font-family="Arial Unicode MS, Arial, Georgia, sans-serif" font-size="14" font-weight="700" fill="${accent}">${escapeXml(item.time)}</text>`
        : "";
      const head = lineBlock(names, 682, itemY + 22, shrink < 0.9 ? 14 : 17, ink, 650);
      const body = lineBlock(details, 682, itemY + 22 + names.length * 18, shrink < 0.9 ? 12 : 13, mute, 500);
      itemY += rawHeights[index] * shrink;
      return `${icon}${time}${head}${body}`;
    })
    .join("");

  const footY = H - footH + 8;
  const footSvg = foot
    .map((line, index) => lineBlock(allLines(line, 960, 15), 56, footY + index * 22, 15, ink, 600))
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${paper}"/>
  ${background ? `<image href="${background}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/><rect width="${W}" height="${H}" fill="${paper}" fill-opacity="0.38"/>` : ""}
  ${ornaments(accent)}
  ${lineBlock(titleLines, 56, 88, titleSize, ink, 650)}
  ${lineBlock(tag, 1024, 88, 16, mute, 500, "end")}
  ${subBlock}
  ${introSvg}
  ${extraSvg}
  <text x="590" y="268" font-family="Arial Unicode MS, Arial, Georgia, sans-serif" font-size="20" font-weight="650" fill="${accent}">${escapeXml(programme)}</text>
  ${programSvg}
  ${footSvg}
</svg>`;
}

export async function composeDesignedPoster(
  projectId: string,
  art: PosterArt,
  brand?: BrandKit | null,
  kind = "invite",
  brief = ""
) {
  captureInviteBackground(projectId);
  const bgPath = stillBgFile(projectId);
  const live = stillFile(projectId, 1);
  if (!fs.existsSync(bgPath) && fs.existsSync(live) && fs.statSync(live).size > 0) {
    fs.copyFileSync(live, bgPath);
  }
  let background = "";
  if (fs.existsSync(bgPath) && fs.statSync(bgPath).size > 0) {
    background = `data:image/jpeg;base64,${fs.readFileSync(bgPath).toString("base64")}`;
  }
  const invite = mergeInvite(art, brief);
  const uk = art.language === "uk" || hasCyrillic(invite.name, invite.intro, ...invite.lines);
  const svg = kind === "invite" || invite.program.length >= 2 ? buildChatFlyer(invite, brand, background, uk) : buildCard(invite, brand, background);
  const fonts = inviteFonts(
    hasCyrillic(invite.name, invite.intro, invite.closing, invite.address, ...invite.lines, ...invite.program.flatMap((item) => [item.title, item.detail]))
  );
  const renderer = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
    font: fontSetup(fonts),
  });
  await writeStillFromPng(projectId, 1, renderer.render().asPng());
  return stillFile(projectId, 1);
}
