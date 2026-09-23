import OpenAI from "openai";
import { config } from "../config.js";
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
};

export type Idea = {
  title: string;
  hook: string;
  concept: string;
  audience: string;
  visualDirection: string;
};

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

export function brandLook(brand?: BrandKit | null) {
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
  ]
    .filter(Boolean)
    .join("\n");
}

function withBrandLook(base: string, brand?: BrandKit | null) {
  const look = brandLook(brand);
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
    brand.business_name && `Brand name: ${brand.business_name}. Use this name if a title card is needed. Do not invent another.`,
    brand.tone_of_voice && `Tone of voice: ${brand.tone_of_voice}`,
    brand.tone_note && `Owner note on tone: ${brand.tone_note}`,
    brand.primary_color && `Primary colour: ${brand.primary_color}. Grade light and accents toward it.`,
    brand.secondary_color && `Secondary colour: ${brand.secondary_color}. Use for paper, type, quiet space.`,
    brand.font && `Title font feel: ${brand.font}.`,
    brand.logo_url && `They have a logo at ${brand.logo_url}. Do not invent a different mark.`,
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

async function jsonCompletion<T>(system: string, user: string, fallback: T): Promise<{ data: T; provider: string; model: string; cost: number }> {
  const openai = client();
  const model = config.openaiModel || "gpt-4o-mini";
  if (!openai) {
    return { data: fallback, provider: "auteur-studio", model: "preview", cost: 0 };
  }
  const response = await openai.chat.completions.create({
    model,
    temperature: 0.8,
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
  photo: "Still photo post: the facts they wrote, plus something interesting to look at. Four specific photographs from their words — not a beige empty room.",
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
      ? `Four concrete shots from “${prompt.slice(0, 120)}”: a close still life, the activity itself, a named object, and leftover light. No empty showroom.`
      : brand?.primary_color
        ? `Warm practical light, ${brand.primary_color} accents, generous negative space, ${brand.font} titles.`
        : "Warm practical light, terracotta accents, generous negative space, serif titles over handheld texture.",
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
    { time: "26–30s", onScreen: idea.title, voiceover: "Save this. Then go.", visualPrompt: `Title card, cinematic, vertical 9:16, for: ${prompt}` },
  ];
  return {
    durationSec: 30,
    cta: "Follow for the next city / offer / story.",
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

export function stillPicturePrompt(
  brief: string,
  idea: Idea,
  role: string,
  index = 1,
  total = 1,
  kind = "photo",
  feedback?: RegenNote,
  brand?: BrandKit | null
) {
  const asked = brief
    .replace(/\*\*/g, "")
    .replace(/[_#`]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);
  const withCopy = kind === "invite" || kind === "info" || kind === "offer";
  return [
    withCopy
      ? "Create one finished designed picture from this request. Do what they asked — layout, words and photograph together."
      : "Create one finished photograph from this request.",
    asked,
    brandLook(brand),
    withCopy &&
      "Fill the whole canvas edge to edge. Keep a clear empty margin at the bottom so the last line is fully visible. If a line does not fit, wrap it or move it — never clip, crop or run words off the edge. Same language as the request. Proofread. No app UI, no watermark.",
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
  feedback?: RegenNote
) {
  const fallback: IdeaResult = {
    ...mockIdea(prompt, type, brand, imageIntent),
    ...(imageIntent === "invite" ? { invite: guessPoster(prompt, "invite") } : {}),
  };
  const kindGuide = type === "image_post" ? IMAGE_KIND_GUIDE[imageIntent] || IMAGE_KIND_GUIDE.photo : "";
  const keys =
    imageIntent === "invite"
      ? "title, hook, concept, audience, visualDirection, invite { name, date, time, place, address, intro, closing, lines: string[], program: [{ time, title, detail }] }"
      : "title, hook, concept, audience, visualDirection";
  return jsonCompletion<IdeaResult>(
    `You are the creative director of Auteur, an AI content studio. The user never chooses models or prompts. You decide the concept. ${
      type === "image_post"
        ? "Format: still Instagram images. OpenAI gets the whole brief and returns a finished picture. We do not assemble pieces afterwards."
        : "Format: vertical short-form video unless told otherwise."
    }${kindGuide ? `\n${kindGuide}` : ""}\n${brandContext(brand)}`,
    `Content type: ${type}${imageIntent ? `\nImage kind: ${imageIntent}` : ""}\nUser request: ${prompt}${
      regenInstruction(feedback) ? `\n${regenInstruction(feedback)}` : ""
    }\nReturn JSON with keys: ${keys}.${
      imageIntent === "invite"
        ? " Never translate. Proofread names, dates, place and programme; keep facts, fix spelling, keep normal spaces between words. intro/closing only if they wrote them. program only if they listed times. visualDirection = how a designed flyer is composed (photo area + type blocks), not a single stock portrait with a caption."
        : imageIntent === "info" || imageIntent === "offer"
          ? " visualDirection = a designed post: photography plus type as one layout, not a stock photo with a paragraph on top. Proofread. Do not invent a different story."
          : " visualDirection = one concrete photograph from their words, not a generic mood. Do not invent a different story."
    }`,
    fallback
  );
}

export async function generateScript(prompt: string, idea: Idea, brand?: BrandKit | null, feedback?: RegenNote) {
  const fallback = mockScript(prompt, idea, brand);
  return jsonCompletion<Script>(
    `Write a 30-second vertical video script. 4–6 scenes. Voiceover should sound spoken, not marketed.\n${brandContext(brand)}`,
    `Request: ${prompt}\nIdea: ${JSON.stringify(idea)}${regenInstruction(feedback) ? `\n${regenInstruction(feedback)}` : ""}\nReturn JSON: { durationSec, cta, scenes: [{ id, time, onScreen, voiceover, visualPrompt }] }`,
    fallback
  );
}

export async function generateVisuals(
  script: Script,
  brand?: BrandKit | null,
  kind: "video" | "still" | "poster" = "video",
  persist?: (visual: Visual) => Promise<Visual>
) {
  const openai = client();
  const visuals: Visual[] = [];
  let provider = "auteur-studio";
  let model = "preview-frames";
  let cost = 0;
  let live = 0;
  let lastError = "";

  for (const scene of script.scenes) {
    const frame = await generateSceneFrame(scene, brand, kind);
    const visual =
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

export async function generateOneVisual(scene: ScriptScene, brand?: BrandKit | null, kind: "video" | "still" | "poster" = "video") {
  const openai = client();
  const frame = await generateSceneFrame(scene, brand, kind);
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

function imageSize(model: string, kind: "video" | "still" | "poster") {
  if (kind === "still") return "1024x1024" as const;
  if (kind === "poster") return model === "dall-e-3" ? ("1024x1792" as const) : ("1024x1536" as const);
  return model === "dall-e-3" ? ("1024x1792" as const) : ("1024x1536" as const);
}

function humanImageError(message: string) {
  if (/does not exist/i.test(message)) {
    return "This OpenAI project has no image model. Enable gpt-image-2.5-sunburst in the project, or set OPENAI_IMAGE_MODEL.";
  }
  if (/billing|quota|insufficient/i.test(message)) {
    return "OpenAI image billing is not enabled on this key.";
  }
  return "We couldn’t generate these frames. Try a simpler description.";
}

async function generateSceneFrame(scene: ScriptScene, brand?: BrandKit | null, kind: "video" | "still" | "poster" = "video") {
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

  const prompt = withBrandLook(
    kind === "poster"
      ? scene.visualPrompt
      : kind === "still"
        ? `${scene.visualPrompt}. Square 1:1 finished image.`
        : `${scene.visualPrompt}. Vertical 9:16 cinematic still, filmic, no text overlay.`,
    brand
  );

  const once = async (model: string) => {
    const gptImage = /^gpt-image/i.test(model);
    const image = await openai.images.generate({
      model,
      prompt: prompt.slice(0, gptImage ? 32000 : 4000),
      size: imageSize(model, kind),
      n: 1,
      ...(gptImage ? { output_format: "png", quality: "high" } : {}),
    });
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

  let lastError = "";
  for (const model of imageModels()) {
    try {
      return await once(model);
    } catch (error) {
      const message = error instanceof Error ? error.message : "image failed";
      lastError = humanImageError(message);
      console.error("Image frame failed", scene.id, model, message);
      const status = Number((error as { status?: number }).status);
      if (/does not exist/i.test(message)) continue;
      if (status >= 500 && status < 600) {
        try {
          return await once(model);
        } catch (retryError) {
          lastError = humanImageError(retryError instanceof Error ? retryError.message : "image failed");
          console.error("Image retry failed", scene.id, model, lastError);
        }
      }
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
  return jsonCompletion<Voiceover>(
    `Cast a voice for a 30s vertical film. This is direction for TTS, not audio. Prefer British English unless the brand says otherwise.\n${brandContext(brand)}`,
    `Script: ${spoken}\nReturn JSON: { voicePreset, script, notes }`,
    fallback
  );
}

export async function generateCaptions(script: Script) {
  const fallback: { cues: CaptionCue[] } = { cues: [] };
  let t = 0;
  for (const scene of script.scenes) {
    const words = scene.voiceover.split(" ");
    const dur = Math.max(3, Math.round(30 / script.scenes.length));
    fallback.cues.push({ start: t, end: t + dur, text: words.slice(0, 8).join(" ") });
    t += dur;
  }

  return jsonCompletion<{ cues: CaptionCue[] }>(
    "Turn a 30-second script into burned-in caption cues. Short lines, 3–8 words.",
    `Scenes: ${JSON.stringify(script.scenes)}\nReturn JSON: { cues: [{ start, end, text }] } with start/end in seconds.`,
    fallback
  );
}
