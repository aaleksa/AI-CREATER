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

function parseLearned(value?: string | null): LearnedSummary | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as LearnedSummary;
  } catch {
    return null;
  }
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
  photo: "Still photo post: four complementary photographs from what they actually wrote. Specific objects and light, not a generic stock set.",
  invite: "Event invitation: briefs vary. Extract name, date, time, place, and address (street or postcode) only if written. intro and closing only if they wrote a warm opening or farewell. Programme only if they listed times. Photographs from their words. No letters.",
  info: "Information post: four photographs of the world around the fact — the closed door, the room, the return. Interesting pictures from their words, no burned-in type.",
  offer: "Offer post: four photographs of the offer as a real moment. Use their words. No burned-in type.",
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
    visualDirection: brand?.primary_color
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

export function stillPicturePrompt(brief: string, idea: Idea, role: string, index = 1, total = 1) {
  const asked = brief
    .replace(/\*\*/g, "")
    .replace(/[_#`]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
  const frame =
    total === 1
      ? "One photograph. Use the most vivid scene from what they wrote."
      : `Photograph ${index} of ${total}: ${role}. Pick a different moment from their words than the other frames.`;
  return [
    "Make a specific, interesting photograph from what they asked for — not a generic stock scene.",
    `They wrote: ${asked}`,
    idea.visualDirection && `Look: ${idea.visualDirection}`,
    frame,
    "Show real objects, people and light from their description. If they named yoga, a workshop, a salon, a retreat, a closed day — show that world.",
    "No letters, no numbers, no logo, no UI, no poster layout.",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function generateIdea(prompt: string, type: string, brand?: BrandKit | null, imageIntent = "") {
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
        ? imageIntent === "invite"
          ? "Format: invitation. Photograph the scenes they named — we set the type ourselves. Never ask the image model to write words."
          : "Format: still Instagram photos from the user’s description — not video, no voiceover. Each picture should be interesting and different."
        : "Format: vertical short-form video unless told otherwise."
    }${kindGuide ? `\n${kindGuide}` : ""}\n${brandContext(brand)}`,
    `Content type: ${type}${imageIntent ? `\nImage kind: ${imageIntent}` : ""}\nUser request: ${prompt}\nReturn JSON with keys: ${keys}.${
      imageIntent === "invite"
        ? " Briefs vary. Fill name, date, time, place, address only if present — do not invent a street or postcode. intro = their opening warmth if written. closing = their farewell if written. Empty if missing. program only for timed items they listed. visualDirection names real scenes from the brief."
        : " visualDirection must name real scenes from the request, not a generic mood."
    }`,
    fallback
  );
}

export async function generateScript(prompt: string, idea: Idea, brand?: BrandKit | null) {
  const fallback = mockScript(prompt, idea, brand);
  return jsonCompletion<Script>(
    `Write a 30-second vertical video script. 4–6 scenes. Voiceover should sound spoken, not marketed.\n${brandContext(brand)}`,
    `Request: ${prompt}\nIdea: ${JSON.stringify(idea)}\nReturn JSON: { durationSec, cta, scenes: [{ id, time, onScreen, voiceover, visualPrompt }] }`,
    fallback
  );
}

export async function generateVisuals(
  script: Script,
  brand?: BrandKit | null,
  kind: "video" | "still" = "video",
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

export async function generateOneVisual(scene: ScriptScene, brand?: BrandKit | null, kind: "video" | "still" = "video") {
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
  const preferred = config.openaiImageModel || "gpt-image-1";
  return [...new Set([preferred, "gpt-image-1", "dall-e-3"])];
}

function imageSize(model: string, kind: "video" | "still") {
  if (kind === "still") return "1024x1024" as const;
  return model === "dall-e-3" ? ("1024x1792" as const) : ("1024x1536" as const);
}

function humanImageError(message: string) {
  if (/does not exist/i.test(message)) {
    return "This OpenAI project has no image model. Enable gpt-image-1 in the project, or set OPENAI_IMAGE_MODEL.";
  }
  if (/billing|quota|insufficient/i.test(message)) {
    return "OpenAI image billing is not enabled on this key.";
  }
  return "We couldn’t generate these frames. Try a simpler description.";
}

async function generateSceneFrame(scene: ScriptScene, brand?: BrandKit | null, kind: "video" | "still" = "video") {
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

  const prompt =
    kind === "still"
      ? `${scene.visualPrompt}. Square 1:1 Instagram still photograph, natural light, no text overlay, no UI chrome.${brand?.primary_color ? ` Colour grade towards ${brand.primary_color}${brand.secondary_color ? ` with ${brand.secondary_color} quiet space` : ""}.` : ""}${brand?.vertical ? ` A real ${brand.vertical}, not a stock set.` : ""}`
      : `${scene.visualPrompt}. Vertical 9:16 cinematic still, filmic, no text overlay.${brand?.primary_color ? ` Colour grade towards ${brand.primary_color}${brand.secondary_color ? ` with ${brand.secondary_color} quiet space` : ""}.` : ""}${brand?.vertical ? ` A real ${brand.vertical}, not a stock set.` : ""}`;

  const once = async (model: string) => {
    const image = await openai.images.generate({
      model,
      prompt: prompt.slice(0, model === "gpt-image-1" ? 32000 : 4000),
      size: imageSize(model, kind),
      n: 1,
      ...(model === "gpt-image-1" ? { output_format: "jpeg", quality: "medium" } : {}),
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
