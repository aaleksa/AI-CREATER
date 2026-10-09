import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { config } from "../config.js";
import { canvasLine, padToNative, paintsExactSize, sizeFor, type ImageFormat } from "./imageFormats.js";
import { COMFY_FAILED_MESSAGE, comfyEnabled, comfyFallsBackToOpenAI, comfyHandles, comfyPaint } from "./comfy.js";
import { listBrandRefFiles, logoKindFromBytes, type BrandImageFile } from "./brandAssets.js";
import { guessPoster, type InviteCard } from "./invite.js";

export type LearnedSummary = {
  generatedAt: string;
  basedOnProjects: number;
  avoid?: string[];
  preferredPace?: string;
  preferredVoice?: string;
  visualNotes?: string;
};

export type BrandKit = {
  user_id?: string;
  business_name: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  font: string;
  tone_of_voice: string;
  website: string;
  instagram: string;
  vertical?: string;
  vertical_note?: string;
  tone_note?: string;
  learned_summary_json?: string | null;
  ref_place_url?: string;
  ref_people_url?: string;
  ref_product_url?: string;
  logo_on_photos?: boolean | number | string;
  contact_on_photos?: boolean | number | string;
  address?: string;
};

export function wantsLogoStamp(brand?: BrandKit | null) {
  return brand?.logo_on_photos === true || brand?.logo_on_photos === 1 || brand?.logo_on_photos === "1";
}

/** Instagram handle as "@name" and the site without protocol, the way people say and read them. */
export function contactParts(brand?: BrandKit | null) {
  const rawHandle = String(brand?.instagram || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  const handleName = rawHandle.replace(/^https?:\/\/[^/]*\//i, "").replace(/^@+/, "").split("/").pop() || "";
  const handle = /^[A-Za-z0-9._]{1,30}$/.test(handleName) ? `@${handleName}` : "";
  const site = String(brand?.website || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .replace(/[^\w.\-/~%]/g, "")
    .slice(0, 40);
  return { handle, site };
}

/** The one line we may print on a photo: "@name · site". */
export function contactStampText(brand?: BrandKit | null) {
  const { handle, site } = contactParts(brand);
  return [handle, site].filter(Boolean).join("  ·  ");
}

export function wantsContactStamp(brand?: BrandKit | null) {
  const on = brand?.contact_on_photos === true || brand?.contact_on_photos === 1 || brand?.contact_on_photos === "1";
  return on && Boolean(contactStampText(brand));
}

/** Tells the script writer how to close with the owner's real handle or site. */
function contactCtaLine(brand?: BrandKit | null) {
  const { handle, site } = contactParts(brand);
  if (!handle && !site) return "";
  const where = [handle && `Instagram ${handle}`, site && `website ${site}`].filter(Boolean).join(" and ");
  return [
    `Call to action: the last scene invites the viewer to find them — ${where}.`,
    "In the voiceover say it the way a person would (no @ sign, no https), for example: find us on Instagram, name of the account.",
    `Write cta and the last onScreen caption with the exact text ${handle || site}. Do not invent another handle, site or address.`,
  ].join(" ");
}

export type Shot = {
  subject: string;
  place: string;
  angle: string;
  people: string;
  mood: string;
  words: string;
  summary: string;
};

export type Idea = {
  title: string;
  hook: string;
  concept: string;
  audience: string;
  visualDirection: string;
  shot: Shot;
  shotConfirmed: boolean;
};

function clipField(value: string, max: number) {
  return value.slice(0, max);
}

export function emptyShot(): Shot {
  return { subject: "", place: "", angle: "", people: "", mood: "", words: "", summary: "" };
}

export function tidyShot(data: unknown): Shot | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<Shot>;
  const shot: Shot = {
    subject: clipField(plainText(row.subject), 240),
    place: clipField(plainText(row.place), 160),
    angle: clipField(plainText(row.angle), 160),
    people: clipField(plainText(row.people), 160),
    mood: clipField(plainText(row.mood), 160),
    words: clipField(plainText(row.words), 200),
    summary: clipField(plainText(row.summary), 280),
  };
  if (!shot.summary && !shot.subject && !shot.place) return null;
  return shot;
}

export function fallbackShot(idea: Pick<Idea, "visualDirection" | "concept" | "title">, prompt = ""): Shot {
  const summary = clipField(plainText(idea.visualDirection) || plainText(idea.concept) || plainText(prompt), 280);
  return {
    subject: summary,
    place: "",
    angle: "",
    people: "",
    mood: "",
    words: "none",
    summary: summary || clipField(plainText(idea.title), 280),
  };
}

export function shotLines(shot?: Shot | null) {
  if (!shot) return [];
  return [
    shot.summary && `Shot: ${shot.summary}`,
    shot.subject && `In the frame: ${shot.subject}`,
    shot.place && `Place: ${shot.place}`,
    shot.angle && `Camera: ${shot.angle}`,
    shot.people && `People: ${shot.people}`,
    shot.mood && `Light and mood: ${shot.mood}`,
    shot.words && `Words in the photograph: ${shot.words}`,
  ].filter(Boolean) as string[];
}

export type ScriptScene = {
  id: number;
  time: string;
  onScreen: string;
  voiceover: string;
  visualPrompt: string;
};

export type Script = {
  durationSec: number;
  scenes: ScriptScene[];
  cta: string;
};

export type Visual = {
  sceneId: number;
  imageUrl: string;
  prompt: string;
  placeholder?: boolean;
};

export type Voiceover = {
  voicePreset: string;
  voice?: string;
  script: string;
  notes: string;
};

export type CaptionCue = {
  start: number;
  end: number;
  text: string;
};

export type RegenNote = { reason?: string; note?: string };

export function plainText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join(" ");
  return "";
}

export function tidyIdea(data: unknown): Idea | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<Idea> & { shotConfirmed?: unknown };
  const title = plainText(row.title);
  const hook = plainText(row.hook);
  const concept = plainText(row.concept);
  const audience = plainText(row.audience);
  const visualDirection = plainText(row.visualDirection);
  if (!title && !hook && !concept && !visualDirection && !tidyShot(row.shot)) return null;
  const base = { title, hook, concept, audience, visualDirection };
  const shot = tidyShot(row.shot) || fallbackShot(base);
  return {
    ...base,
    visualDirection: visualDirection || shot.summary,
    shot: shot.summary ? shot : { ...shot, summary: visualDirection },
    shotConfirmed: row.shotConfirmed === true,
  };
}

export function tidyVoice(data: unknown): Voiceover | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<Voiceover>;
  const notes = typeof row.notes === "string" ? row.notes.trim() : "";
  return {
    voicePreset: plainText(row.voicePreset),
    voice: plainText(row.voice) || plainText(row.voicePreset),
    script: plainText(row.script),
    notes: notes || "Natural pace. Pause after the hook. Never sound like an ad read.",
  };
}

const REASON_LINE: Record<string, string> = {
  wrong_angle: "wrong angle",
  too_salesy: "too salesy",
  not_our_audience: "wrong audience",
  boring_hook: "boring hook",
  too_long_short: "wrong length",
  wrong_tone: "wrong tone",
  weak_cta: "weak call to action",
  not_our_voice: "not their voice",
  wrong_style: "wrong visual style",
  wrong_colors: "wrong colours",
  doesnt_match_brand: "does not match the brand",
  low_quality: "low quality",
  wrong_pace: "wrong pace",
  sounds_robotic: "sounds robotic",
  wrong_gender_accent: "wrong voice or accent",
  bad_timing: "bad caption timing",
  hard_to_read: "hard to read",
  other: "something else they wrote",
};

export function regenInstruction(feedback?: RegenNote) {
  const reason = String(feedback?.reason || "").trim();
  const note = String(feedback?.note || "").trim();
  if (!reason && !note) return "";
  const label = reason && reason !== "other" ? REASON_LINE[reason] || reason : "";
  const bits = [label, note].filter(Boolean);
  if (!bits.length) return "";
  return `They rejected the last version. Take this into account and do not repeat it: ${bits.join(" — ")}.`;
}

function parseLearned(value?: string | null): LearnedSummary | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as LearnedSummary;
  } catch {
    return null;
  }
}

export function brandLook(brand?: BrandKit | null, mode: "designed" | "photo" = "designed") {
  if (!brand) return "";
  const niche =
    brand.vertical === "salon"
      ? "This is a salon. Real chair, cut, quiet — not stock hair or a generic spa."
      : brand.vertical === "cafe"
        ? "This is a café. Real pour, room, regulars — not a latte cliché."
        : brand.vertical === "fitness"
          ? "This is a fitness studio. Real floor and breath — not a gym advert."
          : brand.vertical === "other" && brand.vertical_note
            ? `This is a ${brand.vertical_note}. Use real details of that trade.`
            : "";
  if (mode === "photo") {
    return [
      "Use this brand kit as colour and mood only. Do not invent another business.",
      "Do not paint the business name, a logo, a title card, or any letters on the picture. If a logo belongs on this photo, we add their file ourselves after.",
      "If the scene is a place or story that is not this trade, photograph that scene. The kit is grade and mood, not a different subject.",
      brand.primary_color && `Grade light and accents toward ${brand.primary_color}.`,
      brand.secondary_color && `Quiet space may lean ${brand.secondary_color}.`,
      brand.tone_of_voice && `Mood: ${brand.tone_of_voice}.`,
      brand.tone_note && `Owner note on tone: ${brand.tone_note}`,
      niche,
      ...brandRefPrompt(brand, "photo"),
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    "Use this brand kit on the picture. The request is the content; the kit is the look. Do not invent another business.",
    brand.business_name &&
      `Business name: ${brand.business_name}. If a name appears, use this spelling. Do not invent a logo they did not give.`,
    brand.primary_color && `Primary colour ${brand.primary_color} — accents, type, small details.`,
    brand.secondary_color && `Secondary colour ${brand.secondary_color} — paper, background, quiet space.`,
    brand.font && `Type should feel like ${brand.font}.`,
    brand.tone_of_voice && `Mood: ${brand.tone_of_voice}.`,
    brand.tone_note && `Owner note on tone: ${brand.tone_note}`,
    niche,
    ...brandRefPrompt(brand, "designed"),
  ]
    .filter(Boolean)
    .join("\n");
}

function brandHasLogo(brand?: BrandKit | null) {
  return Boolean(brand?.logo_url);
}

function brandRefPrompt(brand?: BrandKit | null, mode: "designed" | "photo" = "designed") {
  if (!brand) return [];
  const lines: string[] = [];
  if (brandHasLogo(brand)) {
    lines.push(
      "They have a real logo on file. Do not invent a different mark and do not redraw it. We place the file ourselves if they asked."
    );
  }
  // Designed flyers never get their photos: a disco poster must not turn into their café.
  if (mode === "designed") return lines;
  if (brand.ref_place_url) {
    lines.push(
      "A photo of their real place is attached. Use it only if this scene is set in their own salon, café or studio — then match that room, furniture and light. If the scene is anywhere else, ignore it."
    );
  }
  if (brand.ref_people_url) {
    lines.push(
      "A photo of a real person from this business is attached. Use that face only if a person from the business belongs in this scene. Otherwise ignore it."
    );
  }
  if (brand.ref_product_url) {
    lines.push("A photo of their real product is attached. Use that item only if the scene needs it. Otherwise ignore it.");
  }
  if (lines.length) {
    lines.push(
      "Input images, when attached, are only their place, person or product — not the logo. Use them as reference, then make a new picture. Do not return the upload unchanged."
    );
  }
  return lines;
}

function withBrandLook(base: string, brand?: BrandKit | null, mode: "designed" | "photo" = "designed") {
  const look = brandLook(brand, mode);
  if (!look) return base;
  if (base.includes("Use this brand kit")) return base;
  return `${base}\n\n${look}`;
}

function brandContext(brand?: BrandKit | null) {
  if (!brand) return "No brand kit yet. Keep the look cinematic and premium. Do not invent a fake business name.";
  const learned = parseLearned(brand.learned_summary_json);
  const niche =
    brand.vertical === "salon"
      ? "This is a salon. Show the chair, the cut, the quiet — not stock hair."
      : brand.vertical === "cafe"
        ? "This is a café. Show the pour, the regular, the room — not a latte cliché."
        : brand.vertical === "fitness"
          ? "This is a fitness studio. Show the floor, the breath, the third set — not a gym advert."
          : brand.vertical === "other" && brand.vertical_note
            ? `This is a ${brand.vertical_note}. Use real details of that trade, not a generic stock set.`
            : "";
  const lines = [
    brand.business_name &&
      `Brand name: ${brand.business_name}. Keep it in the voice. Do not invent another. Do not paint the name on pictures unless they asked.`,
    brand.tone_of_voice && `Tone of voice: ${brand.tone_of_voice}`,
    brand.tone_note && `Owner note on tone: ${brand.tone_note}`,
    brand.primary_color && `Primary colour: ${brand.primary_color}. Grade light and accents toward it.`,
    brand.secondary_color && `Secondary colour: ${brand.secondary_color}. Use for paper and quiet space.`,
    brand.font && `Type feel (voice and designed posts only): ${brand.font}.`,
    brand.logo_url &&
      (wantsLogoStamp(brand)
        ? "They uploaded their real logo. We will stamp that file on photos after generation. Do not paint a logo."
        : "They uploaded their real logo so we know the mark. Do not paint it on photographs."),
    brand.ref_place_url && `They uploaded a photo of their real place. Use that room only when the story is set in their own place; otherwise ignore it.`,
    brand.ref_people_url && `They uploaded a photo of a real person who works there. Prefer that person only when someone from the business belongs in the scene.`,
    brand.ref_product_url && `They uploaded a photo of their real product. Use that item only when the story needs it.`,
    brand.address &&
      `Business address: ${brand.address}. If an invitation or offer has no place in the request, use this address. If the request names another place, use that one. Never invent an address.`,
    brand.instagram && `Instagram: ${brand.instagram}`,
    brand.website && `Website: ${brand.website}`,
    niche,
  ].filter(Boolean) as string[];
  if (learned && learned.basedOnProjects >= 3) {
    const avoidCopy: Record<string, string> = {
      too_salesy: "overly salesy hooks",
      wrong_angle: "the same rejected angle",
      not_our_audience: "hooks that miss this audience",
      boring_hook: "flat or boring hooks",
    };
    lines.push("Patterns that worked for this business before:");
    if (learned.avoid?.length) lines.push(`- Avoid: ${learned.avoid.map((code) => avoidCopy[code] || code).join("; ")}`);
    if (learned.preferredPace === "concise") lines.push("- Keep voiceover concise");
    if (learned.preferredVoice) lines.push(`- Preferred voice: ${learned.preferredVoice.replaceAll("_", " ")}`);
    if (learned.visualNotes) lines.push(`- Visual style: ${learned.visualNotes}`);
    lines.push("These are hints, not hard rules. Follow the user's request if it conflicts.");
  }
  return lines.join("\n");
}

function client() {
  if (!config.openaiKey) return null;
  return new OpenAI({ apiKey: config.openaiKey });
}

function clipInput(text: string) {
  const max = Math.max(1000, config.openaiMaxInputChars || 100000);
  return text.length > max ? text.slice(0, max) : text;
}

async function jsonCompletion<T>(
  system: string,
  user: string,
  fallback: T,
  opts?: { temperature?: number }
): Promise<{ data: T; provider: string; model: string; cost: number }> {
  const openai = client();
  const model = config.openaiModel || "gpt-4o-mini";
  if (!openai) {
    return { data: fallback, provider: "auteur-studio", model: "preview", cost: 0 };
  }
  const response = await openai.chat.completions.create({
    model,
    temperature: opts?.temperature ?? 0.8,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: clipInput(system + "\nAlways reply with valid JSON.") },
      { role: "user", content: clipInput(user) },
    ],
  });
  const text = response.choices[0]?.message?.content || "{}";
  try {
    return {
      data: { ...fallback, ...JSON.parse(text) } as T,
      provider: "openai",
      model,
      cost: 0.002,
    };
  } catch {
    return { data: fallback, provider: "openai", model, cost: 0.002 };
  }
}

const IMAGE_KIND_GUIDE: Record<string, string> = {
  photo: "Still photo post: one concrete photograph from their words — not a beige empty room, not a landscape or mountain they did not ask for.",
  invite: "Finished invitation flyer: photography and words are one designed page (title, programme, date), like ChatGPT would design — not a stock photo with a caption.",
  info: "Information post: a designed page from their fact — photography plus short readable type, one layout.",
  offer: "Offer post: a designed page from their offer — photography plus short readable type, not a price sticker on a stock photo.",
};

function mockIdea(prompt: string, type: string, brand?: BrandKit | null, imageIntent = ""): Idea {
  const brandName = brand?.business_name || "your brand";
  const still = type === "image_post";
  const kindTitle: Record<string, string> = {
    invite: "You’re invited.",
    info: "One thing to know.",
    offer: "Come in for this.",
    photo: "One still. One feeling.",
  };
  return {
    title: still
      ? kindTitle[imageIntent] || "One still. One feeling."
      : type.includes("reel") || type === "tiktok"
        ? "30 seconds. One feeling."
        : "A clear story, told simply.",
    hook: prompt.slice(0, 90),
    concept: still
      ? `A still Instagram ${imageIntent === "invite" ? "invitation" : imageIntent === "info" ? "information post" : imageIntent === "offer" ? "offer" : "photo"} that answers “${prompt}” in one glance. ${brandName} shows in colour and light — not as a logo stamp.`
      : `A vertical film that answers “${prompt}” without asking the viewer to learn any tools. ${brandName} stays visible in colour, type and tone — never as a watermark slapped on at the end.`,
    audience: still
      ? "People scrolling the feed who will stop for a strong photo."
      : "People scrolling fast who will stop for a strong first frame and a human voice.",
    visualDirection: still
      ? `One concrete photograph from “${prompt.slice(0, 120)}”. Real place they named — not a stock landscape.`
      : brand?.primary_color
        ? `Warm practical light, ${brand.primary_color} accents, generous negative space, ${brand.font} titles.`
        : "Warm practical light, terracotta accents, generous negative space, serif titles over handheld texture.",
    shot: still
      ? {
          subject: prompt.slice(0, 160),
          place: "the place they named in the request",
          angle: "natural eye-level, close enough to feel the room",
          people: "only people they mentioned",
          mood: "warm practical light from their words",
          words: "none",
          summary: `Photograph: ${prompt.slice(0, 180)}`,
        }
      : emptyShot(),
    shotConfirmed: false,
  };
}

function mockScript(prompt: string, idea: Idea, brand?: BrandKit | null): Script {
  const vertical = brand?.vertical || "";
  const niche: Record<string, { onScreen: string; voiceover: string }[]> = {
    cafe: [
      { onScreen: "Morning steam", voiceover: "The first pour isn’t for the camera. It’s for the person who walks in half-asleep." },
      { onScreen: "The regular", voiceover: "You already know their name. That’s the whole brand." },
      { onScreen: "The last table", voiceover: "Stay for one more minute. Then tell a friend." },
    ],
    salon: [
      { onScreen: "The chair", voiceover: "This is the quiet before the reveal — not the after photo." },
      { onScreen: "The cut", voiceover: "One good line does more than a hundred filters." },
      { onScreen: "Book in", voiceover: "Save this. Then book the chair, not the trend." },
    ],
    fitness: [
      { onScreen: "The floor", voiceover: "Nobody posts the third set. That’s where it actually happens." },
      { onScreen: "The breath", voiceover: "Slow is still a session. Show up anyway." },
      { onScreen: "Tomorrow", voiceover: "Same hour. Same room. Come back." },
    ],
  };
  const extra = niche[vertical];
  const beats = [
    { time: "0–3s", onScreen: idea.title, voiceover: idea.hook, visualPrompt: `Cinematic opening frame for: ${prompt}` },
    {
      time: "3–10s",
      onScreen: extra?.[0]?.onScreen || "First place",
      voiceover: extra?.[0]?.voiceover || "Start with the unexpected — not the postcard, the street that actually feels like the city.",
      visualPrompt: `Street-level cinematic still for: ${prompt}`,
    },
    {
      time: "10–18s",
      onScreen: extra?.[1]?.onScreen || "Second beat",
      voiceover: extra?.[1]?.voiceover || "Then slow down. Let one detail do the work a list never can.",
      visualPrompt: `Intimate detail shot for: ${prompt}`,
    },
    {
      time: "18–26s",
      onScreen: extra?.[2]?.onScreen || "Third beat",
      voiceover: extra?.[2]?.voiceover || "End on a feeling the viewer can copy this weekend.",
      visualPrompt: `Golden-hour closing frame for: ${prompt}`,
    },
    { time: "26–30s", onScreen: idea.title, voiceover: "Save this. Then go.", visualPrompt: `Golden-hour closing photograph for: ${prompt}` },
  ];
  return {
    durationSec: 30,
    cta: contactParts(brand).handle || contactParts(brand).site || "Follow for the next city / offer / story.",
    scenes: beats.map((b, i) => ({
      id: i + 1,
      time: b.time,
      onScreen: b.onScreen,
      voiceover: b.voiceover,
      visualPrompt: b.visualPrompt,
    })),
  };
}

const PLACEHOLDER_FRAMES = [
  "linear-gradient(160deg,#2b1d14 0%,#c45c26 42%,#f0d3b0 100%)",
  "linear-gradient(180deg,#1a1612 0%,#6b3a22 55%,#e8a87c 100%)",
  "linear-gradient(145deg,#11100e 0%,#3d2a1c 40%,#d7b49a 100%)",
  "linear-gradient(170deg,#241810 0%,#8a4a28 50%,#f4efe8 100%)",
  "linear-gradient(155deg,#0c0b0a 0%,#c45c26 70%,#f7e7d4 100%)",
];

export type IdeaResult = Idea & { invite?: InviteCard };

export type PosterArt = {
  headline: string;
  subhead: string;
  lines: string[];
  program: { time: string; title: string; detail: string }[];
  closing: string;
  photography: string;
  layout: string;
  language: string;
};

function cleanWords(value: unknown) {
  return String(value || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[·•]/g, "-")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mockPoster(brief: string, idea: Idea, kind: string): PosterArt {
  return {
    headline: cleanWords(idea.title) || "You're invited",
    subhead: kind === "invite" ? "An invitation" : kind === "offer" ? "An offer" : "",
    lines: [cleanWords(idea.hook)].filter(Boolean),
    program: [],
    closing: "",
    photography: cleanWords(idea.visualDirection) || `A real moment from: ${brief.slice(0, 160)}`,
    layout:
      "Editorial flyer: photography in one part of the frame, type in designed blocks, generous empty space. Not a stock portrait with a paragraph stuck on top.",
    language: /[а-яіїєґ]/i.test(brief) ? "uk" : "en",
  };
}

export async function designPoster(brief: string, idea: Idea, kind: string, feedback?: RegenNote) {
  const fallback = mockPoster(brief, idea, kind);
  if (kind === "photo") {
    return { data: fallback, provider: "auteur-studio", model: "preview", cost: 0 };
  }
  return jsonCompletion<PosterArt>(
    `You write the copy for a printed flyer. We typeset it ourselves — keep every fact from the brief.
Fix spelling and grammar. Same language as the brief. Real words with normal spaces (never "foryourself").
Programme = every time + title + short detail they listed. Do not drop an item.
lines = date, place, and short body — not a novel.
photography = the scene only, no words in the photo.`,
    `Kind: ${kind}
Brief:\n${brief.slice(0, 1800)}
Idea: ${JSON.stringify({ title: idea.title, hook: idea.hook, visualDirection: idea.visualDirection })}
${regenInstruction(feedback) ? regenInstruction(feedback) : ""}
Return JSON: { language, headline, subhead, lines: string[], program: [{ time, title, detail }], closing, photography, layout }.
Do not invent names, times or places.`,
    fallback
  );
}

function posterCopy(art: PosterArt) {
  const program = (art.program || [])
    .filter((item) => cleanWords(item.time) || cleanWords(item.title))
    .map((item) => [cleanWords(item.time), cleanWords(item.title), cleanWords(item.detail)].filter(Boolean).join(" — "));
  return [
    art.headline && `Title: ${cleanWords(art.headline)}`,
    art.subhead && `Subtitle: ${cleanWords(art.subhead)}`,
    ...(art.lines || []).map((line) => cleanWords(line)).filter(Boolean).map((line) => `Line: ${line}`),
    ...program.map((line) => `Programme: ${line}`),
    art.closing && `Closing: ${cleanWords(art.closing)}`,
  ].filter(Boolean) as string[];
}

export function stillPhotoOnly(art: PosterArt, kind = "photo") {
  if (kind === "invite") {
    return "A full-page cream invitation background, watercolor style: pale paper, delicate green leaves and small blush flowers around the edges, airy and empty in the centre for type. No people, no faces, no furniture product shot, no letters, no numbers, no signs, no logos, no poster layout.";
  }
  return [
    "One photograph only. No letters, no numbers, no words, no signs, no logos, no poster, no typography, no UI.",
    art.photography && `Show: ${cleanWords(art.photography)}`,
    "Soft daylight. Not a document, not a screenshot.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function stillPictureFromPoster(art: PosterArt, kind: string, feedback?: RegenNote) {
  const words = posterCopy(art);
  return [
    "One finished designed flyer, as a studio designer would make in ChatGPT — photography and type are one page, not a photo with a caption glued on.",
    art.layout && `Layout: ${cleanWords(art.layout)}`,
    art.photography && `Photograph only this, in part of the frame: ${cleanWords(art.photography)}`,
    words.length
      ? `Paint only these words, in ${art.language === "uk" ? "Ukrainian" : "the brief's language"}. Each word is separate, with a normal space. Never fuse words, never add extra letters:\n${words.join("\n")}`
      : "",
    "If a word will not letter cleanly, move it or leave it off. Prefer a few correct words over many broken ones.",
    "Type may be larger or smaller. If a line does not fit, wrap it or place it elsewhere. Do not squeeze, crop or run off the edge.",
    kind === "invite" ? "This is an invitation flyer, not a yoga stock photo with text." : "",
    regenInstruction(feedback),
    "No app UI, no watermark, no browser chrome.",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function writeImagePrompt(brief: string, idea: Idea, kind: string, feedback?: RegenNote) {
  const asked = brief.replace(/\*\*/g, "").replace(/[_#`]/g, "").replace(/\s+/g, " ").trim().slice(0, 1800);
  const fallback = {
    prompt: stillPicturePrompt(asked, idea, "one finished picture from the request", 1, 1, kind, feedback),
  };
  return jsonCompletion<{ prompt: string }>(
    `You write the image prompt ChatGPT would send to an image model. The user's request is the only source of facts.
Return one prompt that asks for a single finished picture: designed page, photography and words together.
Words on the image must be real words with normal spaces, proofread, same language. Keep a margin so nothing is cropped.
Do not invent names, times or places. Do not tell the model to dump the raw brief.`,
    `Kind: ${kind}
Request:\n${asked}
Idea title: ${idea.title}
${regenInstruction(feedback) || ""}
Return JSON: { prompt } — the image prompt only.`,
    fallback
  );
}

export type PictureLanguage = "en" | "uk" | "";

export function pictureLanguageLine(lang: PictureLanguage) {
  if (lang === "uk") {
    return "Translate the whole brief into Ukrainian first, then paint that Ukrainian translation on the picture. Translate names, dates, times, prices and addresses too — write dates the way a Ukrainian speaker would. Do not leave English (or any other language) on the picture. Proofread. Normal spaces between words.";
  }
  if (lang === "en") {
    return "Translate the whole brief into English first, then paint that English translation on the picture. Translate names, dates, times, prices and addresses too — write dates the way an English speaker would (e.g. 23 жовтня → 23 October). Do not leave Ukrainian (or any other language) on the picture. Proofread. Normal spaces between words.";
  }
  return "Same language as the request. Proofread.";
}

function stripBrief(brief: string) {
  return brief
    .replace(/\*\*/g, "")
    .replace(/[_#`]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2000);
}

export function rewriteStillLanguagePrompt(brief: string, lang: PictureLanguage, paintedCopy = "") {
  const target = lang === "uk" ? "Ukrainian" : lang === "en" ? "English" : "";
  const copy = paintedCopy.trim() || stripBrief(brief);
  return [
    target
      ? `Translate the text in this image to ${target}. Do not change any other aspect of the image.`
      : "Do not change any other aspect of the image except the painted words.",
    "Keep the same photograph, people, crowd, objects, colours, lighting, layout, decorations, cassette, vinyl, equalizer, crop and badge shapes. Do not redraw the scene.",
    "Keep every inscription already on the picture — titles, host, DJ credits, dates, times, address, price, vinyl badge, charity box. Do not drop a line even if it is short. Do not add a line. Do not add extra letters (not 90sS).",
    "The owner's brief stays the same request — only the wording of existing inscriptions changes. Do not paint the brief as a new caption.",
    target
      ? `Replace only the letterforms with this exact ${target} wording, same places, same number of lines:`
      : "Replace only the letterforms with this exact wording, same places, same number of lines:",
    copy,
    "Only the letters change.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function rewriteStillCopyPrompt(copyEdit: string) {
  const note = copyEdit.replace(/\s+/g, " ").trim().slice(0, 400);
  return [
    "Edit the attached image. Keep the same photograph, people, objects, colours, lighting, layout, decorations and crop.",
    "The owner's message is an INSTRUCTION, not a caption. Do not paint that instruction on the picture.",
    `Instruction: ${note}`,
    "Follow the instruction: add or remove painted words as they asked. If they named a line to add, paint only those words. If they asked to remove a line, take that line off.",
    "Never write the instruction itself onto the poster. Do not generate a different scene.",
  ].join("\n\n");
}

export async function readPaintedCopy(imagePath: string) {
  const openai = client();
  if (!openai || !fs.existsSync(imagePath)) return "";
  const bytes = fs.readFileSync(imagePath);
  if (!bytes.length) return "";
  const mime = logoKindFromBytes(bytes) === "png" ? "image/png" : "image/jpeg";
  try {
    const response = await openai.chat.completions.create({
      model: config.openaiModel || "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: clipInput(
                "Read every painted inscription on this poster, top to bottom, left to right. Keep original spelling. One inscription per output line. Include titles, host names, DJ credits (e.g. DJ Vitamin), dates, times, street addresses, prices, vinyl-sticker words and the charity box. Do not skip short overlay lines. Reply with the lines only — no bullets, no commentary."
              ),
            },
            { type: "image_url", image_url: { url: `data:${mime};base64,${bytes.toString("base64")}` } },
          ],
        },
      ],
    });
    return tidyPaintedLines(String(response.choices[0]?.message?.content || ""));
  } catch (error) {
    console.error("readPaintedCopy failed", error instanceof Error ? error.message : error);
    return "";
  }
}

function tidyPaintedLines(text: string) {
  return text
    .replace(/^```[\w]*\n?|\n?```$/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 1800);
}

export async function translateBrief(brief: string, lang: PictureLanguage) {
  const asked = stripBrief(brief);
  if (!asked || (lang !== "en" && lang !== "uk")) return asked;
  const openai = client();
  if (!openai) return asked;
  const target = lang === "uk" ? "Ukrainian" : "English";
  try {
    const response = await openai.chat.completions.create({
      model: config.openaiModel || "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: clipInput(
            `Translate this owner's brief into ${target}. It is the same request — do not add, remove or rewrite facts. Translate names, dates, times, prices and addresses. Write dates the way a ${target} speaker would (Ukrainian «23 жовтня» → English «23 October»). Reply with the translated brief only.`
          ),
        },
        { role: "user", content: clipInput(asked) },
      ],
    });
    const text = String(response.choices[0]?.message?.content || "")
      .replace(/^```[\w]*\n?|\n?```$/g, "")
      .trim()
      .slice(0, 2000);
    return looksLikeTargetLanguage(text, lang) ? text || asked : asked;
  } catch (error) {
    console.error("translateBrief failed", error instanceof Error ? error.message : error);
    return asked;
  }
}

export async function translatePictureCopy(painted: string, lang: PictureLanguage, brief = "") {
  const asked = tidyPaintedLines(painted);
  if (!asked) return "";
  if (lang !== "en" && lang !== "uk") return asked;
  const openai = client();
  if (!openai) return asked;
  const target = lang === "uk" ? "Ukrainian" : "English";
  const glossary = stripBrief(brief);
  const lines = asked.split("\n").filter(Boolean).length;
  const run = async (strict: boolean) => {
    const response = await openai.chat.completions.create({
      model: config.openaiModel || "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: clipInput(
            strict
              ? `You are a translator. Translate each painted poster line into ${target}. Reply with the ${target} lines only — no JSON, no quotes around the whole text, no commentary.
The owner's brief is the same request. Use it only as a glossary for names, dates, times, prices and addresses.
Keep the same number of lines in the same order. Do not drop a line — including DJ credits, vinyl-badge text, price and charity — even if that line is not in the brief. Do not merge lines. Do not add a line.
Proofread: no doubled letters (not 90sS); keep postcodes (EC1V not ECVT); write «from 19.00 to 23.00» not «t 23.00»; auction not auctidn. Write dates the way a ${target} speaker would (Ukrainian «23 жовтня» → English «23 October»). Keep DJ / brand names. Transliterate personal names if needed.`
              : `Translate each painted line into ${target}. Same number of lines, same order. Do not drop a line, even a short DJ credit. Reply with the lines only.`
          ),
        },
        {
          role: "user",
          content: clipInput(
            [glossary ? `Owner's brief (same request, glossary only):\n${glossary}` : "", `${lines} painted lines to translate into ${target}:\n\n${asked}`]
              .filter(Boolean)
              .join("\n\n")
          ),
        },
      ],
    });
    return tidyPaintedLines(String(response.choices[0]?.message?.content || ""));
  };
  let text = (await run(true)) || asked;
  const short = (value: string) => value.split("\n").filter(Boolean).length;
  if (!looksLikeTargetLanguage(text, lang) || short(text) < lines) {
    const again = await run(false);
    if (again && looksLikeTargetLanguage(again, lang) && short(again) >= short(text)) text = again;
  }
  return text || asked;
}

function looksLikeTargetLanguage(text: string, lang: PictureLanguage) {
  const cyr = (text.match(/\p{Script=Cyrillic}/gu) || []).length;
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  if (lang === "uk") return cyr >= 8 || cyr >= lat;
  if (lang === "en") return lat >= 8 && lat >= cyr;
  return true;
}

/** Owner's saved address for flyers: used only when the request names no place of its own. */
function addressLine(brand?: BrandKit | null) {
  const address = String(brand?.address || "").trim();
  if (!address) return "";
  return `Their business address is "${address}". If this picture invites people to an event or offer at their business and the request names no place or address, print this address once as the place line, spelled exactly as given. If the request already names a place or address, use that and do not add this one. If the picture is not about visiting them, do not print it. Never invent a different address.`;
}

export function stillPicturePrompt(
  brief: string,
  idea: Idea,
  role: string,
  index = 1,
  total = 1,
  kind = "photo",
  feedback?: RegenNote,
  brand?: BrandKit | null,
  pictureLanguage: PictureLanguage = ""
) {
  const asked = brief
    .replace(/\*\*/g, "")
    .replace(/[_#`]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);
  const withCopy = kind === "invite" || kind === "info" || kind === "offer";
  const shot = idea.shot?.summary ? idea.shot : fallbackShot(idea, asked);
  const confirmed = shotLines(shot);
  return [
    withCopy
      ? "Create one finished designed picture from this request. Do what they asked — layout, words and photograph together."
      : "Create one finished photograph of this exact scene. Do not invent a different place, landscape, mountain, forest road or story.",
    confirmed.length
      ? ["The owner approved this shot. Follow it exactly:", ...confirmed].join("\n")
      : idea.visualDirection && `Photograph this: ${idea.visualDirection}`,
    `Facts from their request (do not add a different scene):\n${asked}`,
    withCopy ? brandLook(brand, "designed") : brandLook(brand, "photo"),
    withCopy && addressLine(brand),
    withCopy &&
      `Fill the whole canvas edge to edge. Keep a clear empty margin at the bottom so the last line is fully visible. If a line does not fit, wrap it or move it — never clip, crop or run words off the edge. ${pictureLanguageLine(pictureLanguage)} No app UI, no watermark.`,
    !withCopy &&
      (shot.words && !/^none$/i.test(shot.words)
        ? `If words appear, only: ${shot.words}. No other letters.`
        : "Photograph only. No letters, no numbers, no title, no caption painted in the photo."),
    regenInstruction(feedback),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateIdea(
  prompt: string,
  type: string,
  brand?: BrandKit | null,
  imageIntent = "",
  feedback?: RegenNote,
  uiLanguage: "uk" | "en" | "" = ""
) {
  const fallback: IdeaResult = {
    ...mockIdea(prompt, type, brand, imageIntent),
    ...(imageIntent === "invite" ? { invite: guessPoster(prompt, "invite") } : {}),
  };
  const kindGuide = type === "image_post" ? IMAGE_KIND_GUIDE[imageIntent] || IMAGE_KIND_GUIDE.photo : "";
  const still = type === "image_post";
  const shotKey = still ? ", shot { subject, place, angle, people, mood, words, summary }" : "";
  const keys =
    imageIntent === "invite"
      ? `title, hook, concept, audience, visualDirection${shotKey}, invite { name, date, time, place, address, intro, closing, lines: string[], program: [{ time, title, detail }] }`
      : `title, hook, concept, audience, visualDirection${shotKey}`;
  const fieldsWord = still ? "title, hook, concept, audience, visualDirection and every shot field" : "title, hook, concept, audience and visualDirection";
  const ideaLanguage =
    uiLanguage === "uk"
      ? `\nLanguage: write ${fieldsWord} in Ukrainian, whatever language the request is in. Natural, simple Ukrainian.`
      : uiLanguage === "en"
        ? `\nLanguage: write ${fieldsWord} in English, whatever language the request is in.`
        : `\nLanguage: write ${fieldsWord} in the language of the user request.`;
  const shotGuide = still
    ? ` shot is what the camera will see — the owner reads it and says "yes, shoot this" before we pay for the picture. Plain words, one short line per field. Every detail the owner wrote about the scene (objects, flowers, light, furniture, place) must appear in subject, place or mood — never drop one. subject = everything in the frame they described. place = where exactly (their business if they said so; never a landscape they did not mention). angle = camera distance and direction. people = "nobody" unless the request clearly asks for a person; in Ukrainian "пара" next to coffee, tea or a cup means steam, not a couple. mood = light and feeling. words = "none" unless the request explicitly asks for text, a caption, a sign or quoted words on the picture; a description of the scene is never words on the picture. For invitations, information and offers, words = the short lines they want printed. summary = one full sentence of the whole shot the owner can check in two seconds. Only facts from the request; if the request does not say, choose the simplest honest option, do not invent a new story.`
    : "";
  return jsonCompletion<IdeaResult>(
    `You are the creative director of Auteur, an AI content studio. The user never chooses models or prompts. You decide the concept. ${
      type === "image_post"
        ? "Format: still Instagram images. OpenAI gets the whole brief and returns a finished picture. We do not assemble pieces afterwards."
        : "Format: vertical short-form video unless told otherwise."
    }${kindGuide ? `\n${kindGuide}` : ""}${ideaLanguage}\n${brandContext(brand)}`,
    `Content type: ${
      type === "tiktok" || type.includes("reel")
        ? "short vertical video (Instagram or TikTok — same 30-second file)"
        : type
    }${imageIntent ? `\nImage kind: ${imageIntent}` : ""}\nUser request: ${prompt}${
      regenInstruction(feedback) ? `\n${regenInstruction(feedback)}` : ""
    }\nReturn JSON with keys: ${keys}.${
      imageIntent === "invite"
        ? " Never translate. Proofread names, dates, place and programme; keep facts, fix spelling, keep normal spaces between words. intro/closing only if they wrote them. program only if they listed times. visualDirection = how a designed flyer is composed (photo area + type blocks), not a single stock portrait with a caption."
        : imageIntent === "info" || imageIntent === "offer"
          ? " visualDirection = a designed post: photography plus type as one layout, not a stock photo with a paragraph on top. Proofread. Do not invent a different story."
          : " visualDirection = one concrete photograph from their words, not a generic mood. Do not invent a different story."
    }${shotGuide}`,
    fallback,
    still ? { temperature: 0.4 } : undefined
  );
}

/** Rewrites only the shot from one sentence of owner feedback. Cheap text call; nothing is painted. */
const ASKS_FOR_TEXT = /["«»“”„]|напис|надпис|підпис|caption|lettering|sign saying|words on the picture:/i;
const SAYS_NO_TEXT = /без (напису|надпису|підпису|слів)|не (напис|слова)|no (words|text|caption|lettering)|not (words|text)/gi;

function asksForText(text: string) {
  return ASKS_FOR_TEXT.test(text.replace(SAYS_NO_TEXT, " "));
}

/** A photo gets painted words only when the owner clearly asked for text; otherwise the line describes the scene. */
export function keepWordsHonest(shot: Shot, asked: string[], imageIntent = "") {
  const designed = imageIntent === "invite" || imageIntent === "info" || imageIntent === "offer";
  const words = shot.words.trim();
  if (designed || !words || /^(none|немає|нема|без (слів|напису)|—|-)$/i.test(words)) {
    return /^(none|немає|нема|без (слів|напису)|—|-)$/i.test(words) ? { ...shot, words: "" } : shot;
  }
  if (asked.some(asksForText)) return shot;
  const subject = shot.subject.toLowerCase().includes(words.toLowerCase()) ? shot.subject : [shot.subject, words].filter(Boolean).join("; ");
  return { ...shot, subject: subject.slice(0, 240), words: "" };
}

function spacedWords(text: string) {
  return String(text || "")
    .replace(/([a-zа-яіїєґ])([A-ZА-ЯІЇЄҐ])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanOnScreen(text: string) {
  return spacedWords(text)
    .replace(/^(title|end)\s*card\s*:?\s*/i, "")
    .trim();
}

function asPhotoBeat(visualPrompt: string, fallback: string) {
  const text = spacedWords(visualPrompt);
  if (!text) return fallback;
  if (/title\s*card|text overlay|on-?screen (text|type)|lettering|typography|storyboard|timestamps?/i.test(text)) {
    return fallback;
  }
  return text;
}

function photoScript(script: Script, request: string): Script {
  const fallback = `Cinematic photograph for: ${request}`.slice(0, 240);
  return {
    ...script,
    scenes: (script.scenes || []).map((scene) => ({
      ...scene,
      onScreen: cleanOnScreen(scene.onScreen),
      voiceover: spacedWords(scene.voiceover),
      visualPrompt: asPhotoBeat(scene.visualPrompt, fallback),
    })),
  };
}

export function videoFramePrompt(scene: ScriptScene, brand?: BrandKit | null) {
  const fallback = `Cinematic photograph of the moment: ${scene.voiceover || scene.onScreen || "the story"}`.slice(0, 240);
  const beat = asPhotoBeat(scene.visualPrompt, fallback);
  return [
    "One vertical 9:16 photograph for a short film. Real place, real light, cinematic. Fill the frame.",
    beat,
    "Photograph only. No letters, no numbers, no words, no title card, no script, no timestamps, no captions, no UI, no logo, no watermark, no document, no storyboard.",
    brandLook(brand, "photo"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateScript(prompt: string, idea: Idea, brand?: BrandKit | null, feedback?: RegenNote) {
  const fallback = mockScript(prompt, idea, brand);
  const result = await jsonCompletion<Script>(
    `Write a 30-second vertical video script. 4–6 scenes. Voiceover should sound spoken, not marketed.
visualPrompt describes a photograph we would shoot — a real place or moment. Never a title card, never type, never the voiceover printed on the picture.
onScreen is a short later caption (2–6 words) with a normal space between every word.\n${brandContext(brand)}\n${contactCtaLine(brand)}`,
    `Request: ${prompt}\nIdea: ${JSON.stringify(idea)}${regenInstruction(feedback) ? `\n${regenInstruction(feedback)}` : ""}\nReturn JSON: { durationSec, cta, scenes: [{ id, time, onScreen, voiceover, visualPrompt }] }`,
    fallback
  );
  return { ...result, data: photoScript(result.data, prompt) };
}

export type FrameOpts = {
  keepStill?: boolean;
  keepStillPath?: string;
  pictureLanguage?: PictureLanguage;
  brief?: string;
  paintedCopy?: string;
  copyEdit?: string;
  /** Pictures the person attached to this brief as examples. Sent with the request. */
  exampleRefs?: BrandImageFile[];
  /** Shape of the picture (image posts only). */
  format?: ImageFormat;
};

export async function generateVisuals(
  script: Script,
  brand?: BrandKit | null,
  kind: "video" | "still" | "poster" = "video",
  persist?: (visual: Visual) => Promise<Visual>,
  opts?: FrameOpts
) {
  const openai = client();
  const visuals: Visual[] = [];
  let provider = "auteur-studio";
  let model = "preview-frames";
  let cost = 0;
  let live = 0;
  let lastError = "";

  for (const scene of script.scenes) {
    const frame = await generateSceneFrame(scene, brand, kind, opts);
    const visual: Visual =
      persist && !frame.visual.placeholder ? await persist(frame.visual) : frame.visual;
    visuals.push(visual);
    cost += frame.cost;
    if (frame.error) lastError = frame.error;
    if (!visual.placeholder) {
      live += 1;
      provider = frame.provider;
      model = frame.model;
    }
  }

  if (openai && live === 0) {
    throw Object.assign(new Error(lastError || "We couldn’t generate these frames. Try a simpler description."), {
      status: 400,
    });
  }

  return {
    data: visuals,
    provider,
    model,
    cost,
    live,
    refused: visuals.filter((v) => v.placeholder).length,
    usedOpenAI: Boolean(openai),
  };
}

export async function generateOneVisual(
  scene: ScriptScene,
  brand?: BrandKit | null,
  kind: "video" | "still" | "poster" = "video",
  opts?: FrameOpts
) {
  const openai = client();
  const frame = await generateSceneFrame(scene, brand, kind, opts);
  if (openai && frame.visual.placeholder) {
    throw Object.assign(new Error(frame.error || "We couldn’t generate this frame. Try a simpler description."), {
      status: 400,
    });
  }
  return { data: frame.visual, provider: frame.provider, model: frame.model, cost: frame.cost };
}

function imageModels() {
  const preferred = config.openaiImageModel || "gpt-image-2.5-sunburst";
  return [...new Set([preferred, "gpt-image-2.5-sunburst", "gpt-image-1", "dall-e-3"])];
}

function keepStillModels(format?: ImageFormat) {
  const models = [...new Set(["gpt-image-1", ...imageModels().filter((name) => /^gpt-image/i.test(name))])];
  // Models that can paint the exact shape go first, so the picture is never stretched or trimmed.
  return format && format !== "square" ? [...models.filter(paintsExactSize), ...models.filter((m) => !paintsExactSize(m))] : models;
}

function imageSize(model: string, kind: "video" | "still" | "poster", format?: ImageFormat) {
  if (format && kind !== "video") return sizeFor(format, model);
  if (kind === "still") return "1024x1024" as const;
  return model === "dall-e-3" ? ("1024x1792" as const) : ("1024x1536" as const);
}

const GENERIC_IMAGE_ERROR = "We couldn’t generate these frames. Try a simpler description.";

/** Says what actually went wrong, so a server problem is not mistaken for a bad brief. */
function humanImageError(message: string, status = 0) {
  if (/does not exist/i.test(message)) {
    return "This OpenAI project has no image model. Enable gpt-image-2.5-sunburst in the project, or set OPENAI_IMAGE_MODEL.";
  }
  if (/billing|quota|insufficient/i.test(message)) {
    return "OpenAI image billing is not enabled on this key.";
  }
  if (status === 401 || /incorrect api key|invalid api key|invalid_api_key|authentication/i.test(message)) {
    return "OpenAI rejected the API key on this server. Check OPENAI_API_KEY.";
  }
  if (/must be verified|organization.*verif|verify organization/i.test(message)) {
    return "OpenAI needs this organization verified before it allows image models (platform.openai.com → Settings → Organization → Verify).";
  }
  if (/safety|moderation|content[_ ]policy|blocked/i.test(message)) {
    return "The image check blocked this brief. Reword it more simply and try again.";
  }
  if (status === 429 || /rate limit/i.test(message)) {
    return "The image service is busy. Try again in a minute.";
  }
  if (/connection error|timed? ?out|econn|enotfound|fetch failed/i.test(message)) {
    return "We couldn’t reach the image service. Try again in a minute.";
  }
  return GENERIC_IMAGE_ERROR;
}

type FrameResult = {
  visual: Visual;
  provider: string;
  model: string;
  cost: number;
  error: string;
};

function exampleRefLine(count: number, kind: "video" | "still" | "poster") {
  const which = count === 1 ? "The first attached image is" : `The first ${count} attached images are`;
  return `${which} the user's own example${count === 1 ? "" : "s"} for this request. Take the subject, style, composition and mood from ${count === 1 ? "it" : "them"} and make a new finished picture${
    kind === "poster" ? " — it may become the photo area of the design" : ""
  }. Do not copy letters, logos or watermarks from ${count === 1 ? "it" : "them"} unless the brief asks for those words.`;
}

async function generateSceneFrame(
  scene: ScriptScene,
  brand?: BrandKit | null,
  kind: "video" | "still" | "poster" = "video",
  opts?: FrameOpts
): Promise<FrameResult> {
  const openai = client();
  const fallback = PLACEHOLDER_FRAMES[(Math.max(1, scene.id) - 1) % PLACEHOLDER_FRAMES.length];
  const placeholder = {
    visual: { sceneId: scene.id, imageUrl: fallback, prompt: scene.visualPrompt, placeholder: true as const },
    provider: openai ? "openai" : "auteur-studio",
    model: openai ? "image-refused" : "preview-frames",
    cost: 0,
    error: "",
  };
  if (!openai) return placeholder;

  const keepRequested = Boolean(opts?.keepStill || opts?.keepStillPath);
  // Models that paint any size edit the picture as it is. Older ones need it extended back to their shape first.
  const keepStill =
    opts?.keepStillPath && fs.existsSync(opts.keepStillPath) ? fs.readFileSync(opts.keepStillPath) : null;
  let keepPadded: Buffer | null = null;
  if (keepStill && opts?.format && kind !== "video" && opts.keepStillPath) {
    const out = `${opts.keepStillPath}.pad.jpg`;
    if (await padToNative(opts.keepStillPath, opts.format, out)) keepPadded = fs.readFileSync(out);
    fs.rmSync(out, { force: true });
  }
  if (keepRequested && !keepStill?.length) {
    return { ...placeholder, error: "Make the picture first." };
  }
  const basePrompt = keepStill
    ? opts?.copyEdit
      ? rewriteStillCopyPrompt(opts.copyEdit)
      : rewriteStillLanguagePrompt(opts?.brief || "", opts?.pictureLanguage || "", opts?.paintedCopy || "")
    : kind === "video"
      ? videoFramePrompt(scene, brand)
      : withBrandLook(
          kind === "poster"
            ? `${scene.visualPrompt}${opts?.format ? `\n${canvasLine(opts.format)}` : ""}`
            : `${scene.visualPrompt}. ${opts?.format ? canvasLine(opts.format) : "Square 1:1 finished image."} Finished image.`,
          brand,
          kind === "poster" ? "designed" : "photo"
        );

  const examples = keepStill ? [] : opts?.exampleRefs || [];
  const brandRefs = keepStill || kind === "poster" ? [] : brand?.user_id ? listBrandRefFiles(brand.user_id) : [];
  const refs = [...examples, ...brandRefs];
  const prompt = !keepStill && examples.length ? `${basePrompt}\n${exampleRefLine(examples.length, kind)}` : basePrompt;
  // Local ComfyUI (only when COMFYUI_URL is set): plain text-to-picture. Pictures ComfyUI cannot make (designed flyers with
  // words, the user's example or brand photos, edits of an existing picture) always stay on OpenAI.
  if (!keepRequested && !refs.length && comfyEnabled() && comfyHandles(kind)) {
    const size =
      opts?.format && kind !== "video" ? sizeFor(opts.format, "gpt-image-2.5-sunburst") : kind === "still" ? "1024x1024" : "1024x1536";
    const [width, height] = String(size).split("x").map(Number);
    const painted = await comfyPaint({ prompt: scene.visualPrompt, width, height });
    if (painted) {
      return {
        visual: { sceneId: scene.id, imageUrl: painted, prompt: scene.visualPrompt },
        provider: "comfyui",
        model: "comfyui",
        cost: 0,
        error: "",
      };
    }
    // COMFYUI_URL is set, so ComfyUI is the painter. Do not spend OpenAI money unless asked to.
    if (!comfyFallsBackToOpenAI()) return { ...placeholder, error: COMFY_FAILED_MESSAGE };
  }
  const keepKind = keepStill ? logoKindFromBytes(keepStill) : "";
  const keepType = keepKind === "png" ? "image/png" : "image/jpeg";
  const keepName = keepKind === "png" ? `keep-still-${scene.id}.png` : `keep-still-${scene.id}.jpg`;

  const readResult = (model: string, image: Awaited<ReturnType<typeof openai.images.generate>>) => {
    const item = image.data?.[0];
    const url = item?.url || (item?.b64_json ? `data:image/jpeg;base64,${item.b64_json}` : "");
    if (!url) throw Object.assign(new Error("empty image"), { status: 500 });
    return {
      visual: { sceneId: scene.id, imageUrl: url, prompt: scene.visualPrompt },
      provider: "openai",
      model,
      cost: 0.04,
      error: "",
    };
  };

  const generateOnce = async (model: string) => {
    const gptImage = /^gpt-image/i.test(model);
    const image = await openai.images.generate({
      model,
      prompt: prompt.slice(0, gptImage ? 32000 : 4000),
      size: imageSize(model, kind, opts?.format),
      n: 1,
      ...(gptImage ? { output_format: "png", quality: "high" } : {}),
    });
    return readResult(model, image);
  };

  const editOnce = async (model: string) => {
    const usePad = Boolean(keepPadded) && !(opts?.format && paintsExactSize(model));
    const source = usePad ? keepPadded : keepStill;
    const editPrompt = usePad
      ? `${prompt}\nThe blurred bands at the edges are only padding. Leave them alone; change nothing in the sharp picture except what is asked.`
      : prompt;
    const files = await Promise.all([
      ...(source ? [toFile(source, keepName, { type: keepType })] : []),
      ...refs.map((ref, i) => toFile(fs.readFileSync(ref.file), `${i + 1}-${ref.filename}`, { type: ref.type })),
    ]);
    const run = async (fidelity: "high" | "low" | "") => {
      const image = await openai.images.edit({
        model,
        image: files.length === 1 ? files[0] : files,
        prompt: editPrompt.slice(0, 32000),
        size: opts?.format && kind !== "video" ? sizeFor(opts.format, model) : kind === "still" ? "1024x1024" : "1024x1536",
        n: 1,
        quality: "high",
        ...(fidelity ? { input_fidelity: fidelity } : {}),
      } as Parameters<typeof openai.images.edit>[0]);
      return readResult(model, image);
    };
    const preferred = keepStill ? (opts?.copyEdit ? "low" : "high") : "";
    try {
      return await run(preferred);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (preferred && /input_fidelity|unknown parameter|unrecognized|invalid/i.test(message)) {
        return await run("");
      }
      throw error;
    }
  };

  let lastError = "";
  const tryModel = async (model: string, run: (name: string) => ReturnType<typeof generateOnce>) => {
    try {
      return await run(model);
    } catch (error) {
      const message = error instanceof Error ? error.message : "image failed";
      const status = Number((error as { status?: number }).status) || 0;
      const human = humanImageError(message, status);
      // Keep the most useful reason: a later vague failure must not hide an earlier clear one.
      if (human !== GENERIC_IMAGE_ERROR || !lastError) lastError = human;
      console.error("Image frame failed", scene.id, model, status || "", message);
      if (/does not exist/i.test(message)) return null;
      if (status >= 500 && status < 600) {
        try {
          return await run(model);
        } catch (retryError) {
          const retryMessage = retryError instanceof Error ? retryError.message : "image failed";
          const retryHuman = humanImageError(retryMessage, Number((retryError as { status?: number }).status) || 0);
          if (retryHuman !== GENERIC_IMAGE_ERROR || !lastError) lastError = retryHuman;
          console.error("Image retry failed", scene.id, model, retryMessage);
        }
      }
      return null;
    }
  };

  if (keepRequested) {
    for (const model of keepStillModels(opts?.format)) {
      const edited = await tryModel(model, editOnce);
      if (edited) return edited;
    }
    return {
      ...placeholder,
      error: lastError || "We couldn’t rewrite the words on this picture. Try again.",
    };
  }
  if (refs.length) {
    for (const model of imageModels().filter((name) => /^gpt-image/i.test(name))) {
      const edited = await tryModel(model, editOnce);
      if (edited) return edited;
    }
  }
  for (const model of imageModels()) {
    const generated = await tryModel(model, generateOnce);
    if (generated) return generated;
  }
  if (kind === "still" || kind === "poster") {
    for (const model of imageModels()) {
      const again = await tryModel(model, generateOnce);
      if (again) return again;
    }
  }
  return { ...placeholder, error: lastError };
}

export async function generateVoice(script: Script, brand?: BrandKit | null) {
  const spoken = script.scenes.map((s) => s.voiceover).join(" ");
  const preset = brand?.tone_of_voice?.toLowerCase().includes("playful") ? "soft_british_female" : "warm_british_female";
  const fallback: Voiceover = {
    voicePreset: preset,
    voice: preset.replaceAll("_", " "),
    script: spoken,
    notes: "Natural pace. Pause after the hook. Never sound like an ad read.",
  };
  const result = await jsonCompletion<Voiceover>(
    `Cast a voice for a 30s vertical film. This is direction for TTS, not audio. Prefer British English unless the brand says otherwise.
notes must be one short string of speaking direction, not an object.\n${brandContext(brand)}`,
    `Script: ${spoken}\nReturn JSON: { voicePreset: string, script: string, notes: string }`,
    fallback
  );
  return { ...result, data: tidyVoice(result.data) || fallback };
}

export function fitCuesToDuration(cues: CaptionCue[], scenes: ScriptScene[], durationSec: number): CaptionCue[] {
  if (!scenes.length) return [];
  const total = Math.max(1, durationSec);
  const weights = scenes.map((scene) => {
    const n = String(scene.voiceover || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    return Math.max(1, n);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  return scenes.map((scene, i) => {
    const fromCue = String(cues[i]?.text || "").replace(/\s+/g, " ").trim();
    const fromScene = String(scene.onScreen || scene.voiceover || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 8)
      .join(" ");
    const text = (fromCue || fromScene).slice(0, 80);
    const share = (weights[i] / sum) * total;
    const start = t;
    t += share;
    const end = i === scenes.length - 1 ? total : t;
    return { start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100, text };
  });
}

export async function generateCaptions(script: Script, durationSec = 30) {
  const seconds = Math.max(3, durationSec);
  const fallback: { cues: CaptionCue[] } = {
    cues: fitCuesToDuration([], script.scenes, seconds),
  };

  const result = await jsonCompletion<{ cues: CaptionCue[] }>(
    `Turn a voiceover into burned-in caption cues. Short lines, 3–8 words. The audio is ${seconds.toFixed(1)} seconds — cues must cover that whole file, not a guessed 30 seconds.`,
    `Scenes: ${JSON.stringify(script.scenes)}\nAudio duration seconds: ${seconds}\nReturn JSON: { cues: [{ start, end, text }] } with start/end in seconds covering 0–${seconds}.`,
    fallback
  );
  const cues = result.data?.cues?.length ? result.data.cues : fallback.cues;
  return { ...result, data: { cues: fitCuesToDuration(cues, script.scenes, seconds) } };
}
