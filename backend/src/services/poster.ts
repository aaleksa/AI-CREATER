import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { BrandKit } from "./ai.js";
import type { InviteCard, InviteItem } from "./invite.js";
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

function inviteFonts(cyrillic: boolean) {
  const latin = [
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/System/Library/Fonts/NewYork.ttf",
  ];
  const unicode = [
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ];
  return (cyrillic ? [...unicode, ...latin] : [...latin, ...unicode]).filter((file) => fs.existsSync(file));
}

function hexLum(color: string) {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return 1;
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function lineBlock(lines: string[], x: number, y: number, size: number, fill: string, weight = 500, anchor = "start") {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * (size + 8)}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
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
    return `<defs><clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="40"/></clipPath></defs>
      <image href="${photo}" x="${cx - 40}" y="${cy - 40}" width="80" height="80" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>
      <circle cx="${cx}" cy="${cy}" r="40" fill="none" stroke="${ink}" stroke-opacity="0.12"/>`;
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
  return `<g fill="none" stroke="${accent}" stroke-opacity="0.32" stroke-width="1.5" stroke-linecap="round">
    <path d="M70 42 c22 6 34 26 12 46 c-6-18-22-26-12-46z"/><path d="M92 58 c10 4 8 16 -2 18"/>
    <path d="M1010 46 c-24 8-34 28-12 48 c7-18 22-26 12-48z"/><path d="M988 62 c-10 4-8 16 2 18"/>
    <circle cx="540" cy="48" r="3" fill="${accent}" stroke="none" opacity="0.35"/>
    <circle cx="556" cy="48" r="2" fill="${accent}" stroke="none" opacity="0.22"/>
    <circle cx="524" cy="48" r="2" fill="${accent}" stroke="none" opacity="0.22"/>
  </g>`;
}

function buildFlyer(invite: InviteCard, brand?: BrandKit | null, background?: string, shots: string[] = []) {
  const ink = "#2C382C";
  const mute = "#6B7468";
  const paper = hexLum(brand?.secondary_color || "") > 0.75 ? brand!.secondary_color : "#F6F1E8";
  const accent = brand?.primary_color || "#3D5A40";
  const cyr = hasCyrillic(invite.name, invite.intro, invite.closing, invite.address, ...invite.program.map((item) => item.title + item.detail));
  const programme = cyr ? "У програмі" : "Programme";
  const brandName = brand?.business_name || "";
  const title = fit(invite.name, 460, 50, 3);
  let cursor = 108;
  const titleSvg = lineBlock(title.lines, 64, cursor, title.size, ink, 650);
  cursor += title.lines.length * (title.size + 10) + 12;
  const introText = invite.intro || invite.lines[0] || "";
  const intro = fit(introText, 460, 18, 5);
  const introSvg = lineBlock(intro.lines, 64, cursor, intro.size, mute, 500);
  cursor += intro.lines.length * (intro.size + 8) + 16;
  const photoY = Math.min(Math.max(cursor, 560), 760);
  const photoH = Math.max(220, 1188 - photoY - 8);
  const photo = background
    ? `<defs><clipPath id="shot"><rect x="64" y="${photoY}" width="430" height="${photoH}" rx="28"/></clipPath></defs>
       <image href="${background}" x="64" y="${photoY}" width="430" height="${photoH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#shot)"/>`
    : `<rect x="64" y="${photoY}" width="430" height="${photoH}" rx="28" fill="${accent}" opacity="0.2"/>`;

  const metaLines = [
    [invite.date, invite.time].filter(Boolean).join("  ·  "),
    invite.place,
    invite.address,
    invite.closing,
  ].filter(Boolean);
  let metaY = 1234;
  const meta = metaLines
    .map((line, index) => {
      const block = fit(line, 460, index === metaLines.length - 1 && invite.closing ? 16 : 18, 2);
      const svg = lineBlock(block.lines, 64, metaY, block.size, index === 0 || line === invite.place ? ink : mute, 500);
      metaY += block.lines.length * (block.size + 6);
      return svg;
    })
    .join("");

  const textX = 650;
  const textW = 390;
  let itemY = 158;
  const items = invite.program
    .map((item: InviteItem, index) => {
      const titleFit = fit(item.title, textW, 20, 3);
      const detailFit = fit(item.detail, textW, 15, 3);
      const timeW = Math.max(88, item.time.length * 9 + 28);
      const time = item.time
        ? `<rect x="${textX}" y="${itemY - 16}" width="${timeW}" height="26" rx="13" fill="#F4E0E4"/><text x="${textX + timeW / 2}" y="${itemY + 2}" text-anchor="middle" font-size="14" font-weight="650" fill="${accent}">${escapeXml(item.time)}</text>`
        : "";
      const headY = itemY + (item.time ? 28 : 0);
      const head = lineBlock(titleFit.lines, textX, headY, titleFit.size, ink, 600);
      const detailY = headY + titleFit.lines.length * (titleFit.size + 6) + 6;
      const details = lineBlock(detailFit.lines, textX, detailY, detailFit.size, mute, 500);
      const iconY = itemY + Math.max(18, (titleFit.lines.length * titleFit.size) / 2);
      const icon = programShot(596, iconY, ink, shots[index] || "", iconKind(item.title));
      const height = (item.time ? 34 : 8) + titleFit.lines.length * (titleFit.size + 6) + (detailFit.lines.length ? detailFit.lines.length * (detailFit.size + 6) + 8 : 8) + 18;
      const block = `${icon}${time}${head}${details}`;
      itemY += height;
      return block;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="${paper}"/>
  ${ornaments(accent)}
  ${titleSvg}
  ${introSvg}
  ${photo}
  ${meta}
  <text x="562" y="118" font-size="20" font-weight="600" fill="${ink}">${escapeXml(programme)}</text>
  ${items}
  ${brandName ? `<text x="1016" y="1334" text-anchor="end" font-size="15" fill="${accent}">${escapeXml(brandName)}</text>` : ""}
</svg>`;
}

function buildCard(invite: InviteCard, brand?: BrandKit | null, background?: string) {
  const ink = "#2C382C";
  const mute = "#6B7468";
  const paper = hexLum(brand?.secondary_color || "") > 0.75 ? brand!.secondary_color : "#F6F1E8";
  const accent = brand?.primary_color || "#3D5A40";
  const brandName = brand?.business_name || "";
  const title = fit(invite.name, 950, 50, 3);
  let cursor = 110;
  const titleSvg = lineBlock(title.lines, 64, cursor, title.size, ink, 650);
  cursor += title.lines.length * (title.size + 10) + 14;
  const intro = fit(invite.intro || invite.lines[0] || "", 950, 20, 4);
  const introSvg = lineBlock(intro.lines, 64, cursor, intro.size, mute, 500);
  cursor += intro.lines.length * (intro.size + 8) + 12;
  const extra = invite.lines
    .slice(invite.intro ? 0 : 1, 4)
    .map((line) => {
      const rows = fit(line, 950, 18, 2);
      const svg = lineBlock(rows.lines, 64, cursor, rows.size, mute, 500);
      cursor += rows.lines.length * (rows.size + 8) + 8;
      return svg;
    })
    .join("");
  const photoY = Math.min(cursor + 8, 640);
  const photo = background
    ? `<defs><clipPath id="shot"><rect x="64" y="${photoY}" width="952" height="${1168 - photoY}" rx="28"/></clipPath></defs>
       <image href="${background}" x="64" y="${photoY}" width="952" height="${1168 - photoY}" preserveAspectRatio="xMidYMid slice" clip-path="url(#shot)"/>`
    : `<rect x="64" y="${photoY}" width="952" height="${1168 - photoY}" rx="28" fill="${accent}" opacity="0.2"/>`;
  const foot = [
    [invite.date, invite.time].filter(Boolean).join("  ·  "),
    [invite.place, invite.address].filter(Boolean).join(" · "),
    invite.closing,
  ].filter(Boolean);
  let footY = 1280;
  const footer = foot
    .map((line) => {
      const block = fit(line, 900, 18, 2);
      const svg = lineBlock(block.lines, 64, footY, block.size, ink, 500);
      footY += block.lines.length * (block.size + 6);
      return svg;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="${paper}"/>
  ${ornaments(accent)}
  ${titleSvg}
  ${introSvg}
  ${extra}
  ${photo}
  ${footer}
  ${brandName ? `<text x="1016" y="1334" text-anchor="end" font-size="15" fill="${accent}">${escapeXml(brandName)}</text>` : ""}
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
