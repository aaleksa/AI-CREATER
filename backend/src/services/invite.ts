export type InviteItem = {
  time: string;
  title: string;
  detail: string;
};

export type InviteCard = {
  name: string;
  date: string;
  time: string;
  place: string;
  address: string;
  intro: string;
  closing: string;
  lines: string[];
  program: InviteItem[];
};

const DAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
const UA_MONTHS = "січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня";

export function emptyInvite(): InviteCard {
  return { name: "", date: "", time: "", place: "", address: "", intro: "", closing: "", lines: [], program: [] };
}

function clip(value: unknown, fallback: string, max: number) {
  return String(value ?? fallback).trim().slice(0, max);
}

export function stripDecor(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/[_#`]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseProgram(raw: unknown): InviteItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        time: clip(row.time, "", 20),
        title: clip(row.title, "", 100),
        detail: clip(row.detail, "", 160),
      };
    })
    .filter((item) => item.time || item.title)
    .slice(0, 6);
}

function parseLines(raw: unknown, legacy: string[] = []): string[] {
  const fromArray = Array.isArray(raw)
    ? raw.map((item) => clip(item, "", 180)).filter(Boolean)
    : typeof raw === "string"
      ? raw.split(/\n+/).map((item) => clip(item, "", 180)).filter(Boolean)
      : [];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of [...fromArray, ...legacy]) {
    const key = line.toLowerCase();
    if (!line || seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines.slice(0, 8);
}

function guessProgram(prompt: string): InviteItem[] {
  const rows = prompt.split(/\n/);
  const items: InviteItem[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const line = stripDecor(rows[index]);
    const match = line.match(/^(\d{1,2}:\d{2})\s*[—–\-]\s*(.+)$/);
    if (!match) continue;
    const next = stripDecor(rows[index + 1] || "");
    const detail =
      next && !/^\d{1,2}:\d{2}/.test(next) && next.length > 8 && !/^\d{1,2}\s/.test(next) ? next.slice(0, 140) : "";
    items.push({ time: match[1], title: match[2].slice(0, 80), detail });
  }
  return items.slice(0, 6);
}

function guessDate(text: string) {
  return (
    text.match(new RegExp(`(\\d{1,2}\\s+(?:${UA_MONTHS}))`, "i"))?.[1] ||
    text.match(new RegExp(`\\b((?:${DAYS})(?:\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s+(?:${MONTHS}))?)?)\\b`, "i"))?.[1] ||
    text.match(new RegExp(`\\b(\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS}))\\b`, "i"))?.[1] ||
    ""
  );
}

function guessIntro(prompt: string) {
  const block = prompt
    .split(/\n{2,}/)
    .map(stripDecor)
    .find((line) => /турбуємося|дбаємо|коли востаннє|зупинитися|we (so often|all spend)|when did you last/i.test(line));
  if (block) return block.slice(0, 280);
  return (
    prompt
      .split(/\n+/)
      .map(stripDecor)
      .find((line) => line.length >= 40 && /турбуємося|дбаємо|навколо|для себе|перезавантаж/i.test(line))
      ?.slice(0, 280) || ""
  );
}

function guessClosing(prompt: string) {
  return (
    prompt
      .split(/\n+/)
      .map(stripDecor)
      .find((line) => /будемо раді|раді бачити|see you|can't wait|ти важлива|save this|до зустрічі/i.test(line))
      ?.slice(0, 120) || ""
  );
}

function guessVenue(prompt: string, text: string) {
  const pin = stripDecor(prompt.match(/📍\s*\**([^*\n]+)/)?.[1] || "");
  const postcode = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i)?.[1] || "";
  const raw =
    pin ||
    text.match(/\b((?:Ukrainian\s+)?[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+Hub(?:,\s*[^.\n]+)?)/)?.[1] ||
    text.match(/\bдо\s+([^,.\n]{3,40}?)(?=\s+на\b|\s+о\b|,|\.|$)/i)?.[1]?.trim() ||
    text.match(/\bat\s+(?:the\s+)?([^,.\n]+?)(?=\s+(?:on|this|for|from)|[,.]|$)/i)?.[1]?.trim() ||
    "";
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { place: parts[0].slice(0, 80), address: parts.slice(1).join(", ").slice(0, 160) };
  }
  const leftover = postcode && !raw.toLowerCase().includes(postcode.toLowerCase()) ? postcode : "";
  return { place: (parts[0] || raw).slice(0, 80), address: leftover.slice(0, 160) };
}

function guessLines(prompt: string, used: string[]) {
  const skip =
    /що на тебе|у програм|what.?s on|you.?re invited|запрошуємо тебе|будемо раді|save the date|тільки собі/i;
  const taken = new Set(used.map((item) => item.toLowerCase()).filter(Boolean));
  return prompt
    .split(/\n+/)
    .map(stripDecor)
    .filter((line) => line.length >= 12 && line.length <= 180)
    .filter((line) => !/^\d{1,2}:\d{2}/.test(line))
    .filter((line) => !taken.has(line.toLowerCase()))
    .filter((line) => !skip.test(line))
    .slice(0, 6);
}

export function parseInvite(raw: unknown): InviteCard {
  const row = itemObject(raw);
  let place = clip(row.place, "", 80);
  let address = clip(row.address, "", 160);
  if (!address && place.includes(",")) {
    const parts = place.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      place = parts[0].slice(0, 80);
      address = parts.slice(1).join(", ").slice(0, 160);
    }
  }
  const legacy = [clip(row.subtitle, "", 160), clip(row.note, "", 220)].filter(Boolean);
  const headline = clip(row.headline, "", 80);
  if (headline && !/^you[’']re invited$|^запрошуємо$/i.test(headline)) legacy.unshift(headline);
  return {
    name: clip(row.name, "", 80),
    date: clip(row.date, "", 80),
    time: clip(row.time, "", 80),
    place,
    address,
    intro: clip(row.intro, "", 280),
    closing: clip(row.closing, "", 120),
    lines: parseLines(row.lines, legacy),
    program: parseProgram(row.program),
  };
}

function itemObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export function fillInvite(primary: InviteCard, fallback: InviteCard): InviteCard {
  return parseInvite({
    name: primary.name || fallback.name,
    date: primary.date || fallback.date,
    time: primary.time || fallback.time,
    place: primary.place || fallback.place,
    address: primary.address || fallback.address,
    intro: primary.intro || fallback.intro,
    closing: primary.closing || fallback.closing,
    lines: primary.lines.length ? primary.lines : fallback.lines,
    program: primary.program.length ? primary.program : fallback.program,
  });
}

export function guessInvite(prompt: string): InviteCard {
  const lines = prompt
    .split(/\n+/)
    .map(stripDecor)
    .filter((line) => line.length >= 3);
  const text = stripDecor(prompt);
  const titles = lines.filter((line) => line.length <= 56 && !/^\d{1,2}:\d{2}/.test(line));
  const name = titles[0] || text.split(/[.!?]/)[0]?.trim().slice(0, 80) || "";
  const date = guessDate(text);
  const times = [...text.matchAll(/\b([01]?\d:[0-5]\d)\b/g)].map((match) => match[1]);
  const meridiem = text.match(/\b(\d{1,2}(?::[0-5]\d)?\s*(?:am|pm))\b/i)?.[1] || "";
  const program = guessProgram(prompt);
  const time = program.length >= 2 ? `${program[0].time} – ${program[program.length - 1].time}` : times[0] || meridiem;
  const venue = guessVenue(prompt, text);
  const intro = guessIntro(prompt);
  const closing = guessClosing(prompt);
  return parseInvite({
    name,
    date,
    time,
    place: venue.place,
    address: venue.address,
    intro,
    closing,
    lines: guessLines(prompt, [name, date, time, venue.place, venue.address, intro, closing]),
    program,
  });
}

export function guessInfo(prompt: string): InviteCard {
  const text = stripDecor(prompt);
  const date = guessDate(text);
  const closed = text.match(/\b((?:we['’]?re |we are )?closed[^.]*)/i)?.[1] || "";
  const fact = closed || text.split(/[.!?]/)[0]?.trim() || text.slice(0, 80);
  return parseInvite({
    name: fact.slice(0, 80),
    date,
    lines: guessLines(prompt, [fact, date]),
  });
}

export function guessOffer(prompt: string): InviteCard {
  const text = stripDecor(prompt);
  const date =
    guessDate(text) ||
    text.match(/\b(this week|this month|until [^.,]+)/i)?.[1] ||
    "";
  const deal =
    text.match(/\b(\d+\s*%\s*off[^.,]*)/i)?.[1] ||
    text.match(/\b((?:walk-in |tuesday )?offer[^.,]*)/i)?.[1] ||
    text.split(/[.!?]/)[0]?.trim() ||
    text.slice(0, 80);
  return parseInvite({
    name: deal.slice(0, 80),
    date,
    lines: guessLines(prompt, [deal, date]),
  });
}

export function guessPoster(prompt: string, kind = "invite"): InviteCard {
  if (kind === "info") return guessInfo(prompt);
  if (kind === "offer") return guessOffer(prompt);
  return guessInvite(prompt);
}

export function inviteFrom(raw: unknown, prompt: string, previous?: unknown, kind = "invite"): InviteCard {
  return fillInvite(fillInvite(parseInvite(raw), parseInvite(previous)), guessPoster(prompt, kind));
}
