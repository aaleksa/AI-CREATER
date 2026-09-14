import OpenAI from "openai";
import { config } from "../config.js";

export type BrandKit = {
  business_name: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  font: string;
  tone_of_voice: string;
  website: string;
  instagram: string;
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
};

export type Voiceover = {
  voice: string;
  script: string;
  notes: string;
};

export type CaptionCue = {
  start: number;
  end: number;
  text: string;
};

function brandContext(brand?: BrandKit | null) {
  if (!brand?.business_name) return "No brand kit yet. Keep the look cinematic and premium.";
  return [
    `Brand: ${brand.business_name}`,
    brand.tone_of_voice && `Tone of voice: ${brand.tone_of_voice}`,
    brand.primary_color && `Primary colour: ${brand.primary_color}`,
    brand.font && `Font: ${brand.font}`,
    brand.instagram && `Instagram: ${brand.instagram}`,
    brand.website && `Website: ${brand.website}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function client() {
  if (!config.openaiKey) return null;
  return new OpenAI({ apiKey: config.openaiKey });
}

async function jsonCompletion<T>(system: string, user: string, fallback: T): Promise<{ data: T; provider: string; model: string; cost: number }> {
  const openai = client();
  if (!openai) {
    return { data: fallback, provider: "auteur-studio", model: "preview", cost: 0 };
  }
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system + "\nAlways reply with valid JSON." },
      { role: "user", content: user },
    ],
  });
  const text = response.choices[0]?.message?.content || "{}";
  try {
    return {
      data: { ...fallback, ...JSON.parse(text) } as T,
      provider: "openai",
      model: "gpt-4o-mini",
      cost: 0.002,
    };
  } catch {
    return { data: fallback, provider: "openai", model: "gpt-4o-mini", cost: 0.002 };
  }
}

function mockIdea(prompt: string, type: string, brand?: BrandKit | null): Idea {
  const brandName = brand?.business_name || "your brand";
  return {
    title: type.includes("reel") || type === "tiktok" ? "30 seconds. One feeling." : "A clear story, told simply.",
    hook: prompt.slice(0, 90),
    concept: `A vertical film that answers “${prompt}” without asking the viewer to learn any tools. ${brandName} stays visible in colour, type and tone — never as a watermark slapped on at the end.`,
    audience: "People scrolling fast who will stop for a strong first frame and a human voice.",
    visualDirection: brand?.primary_color
      ? `Warm practical light, ${brand.primary_color} accents, generous negative space, ${brand.font} titles.`
      : "Warm practical light, terracotta accents, generous negative space, serif titles over handheld texture.",
  };
}

function mockScript(prompt: string, idea: Idea): Script {
  const beats = [
    { time: "0–3s", onScreen: idea.title, voiceover: idea.hook, visualPrompt: `Cinematic opening frame for: ${prompt}` },
    { time: "3–10s", onScreen: "First place", voiceover: "Start with the unexpected — not the postcard, the street that actually feels like the city.", visualPrompt: `Street-level cinematic still for: ${prompt}` },
    { time: "10–18s", onScreen: "Second beat", voiceover: "Then slow down. Let one detail do the work a list never can.", visualPrompt: `Intimate detail shot for: ${prompt}` },
    { time: "18–26s", onScreen: "Third beat", voiceover: "End on a feeling the viewer can copy this weekend.", visualPrompt: `Golden-hour closing frame for: ${prompt}` },
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

export async function generateIdea(prompt: string, type: string, brand?: BrandKit | null) {
  const fallback = mockIdea(prompt, type, brand);
  return jsonCompletion<Idea>(
    `You are the creative director of Auteur, an AI content studio. The user never chooses models or prompts. You decide the concept. Format: vertical short-form video unless told otherwise.\n${brandContext(brand)}`,
    `Content type: ${type}\nUser request: ${prompt}\nReturn JSON with keys: title, hook, concept, audience, visualDirection.`,
    fallback
  );
}

export async function generateScript(prompt: string, idea: Idea, brand?: BrandKit | null) {
  const fallback = mockScript(prompt, idea);
  return jsonCompletion<Script>(
    `Write a 30-second vertical video script. 4–6 scenes. Voiceover should sound spoken, not marketed.\n${brandContext(brand)}`,
    `Request: ${prompt}\nIdea: ${JSON.stringify(idea)}\nReturn JSON: { durationSec, cta, scenes: [{ id, time, onScreen, voiceover, visualPrompt }] }`,
    fallback
  );
}

export async function generateVisuals(script: Script, brand?: BrandKit | null) {
  const openai = client();
  const visuals: Visual[] = [];
  let provider = "auteur-studio";
  let model = "preview-frames";
  let cost = 0;

  for (const scene of script.scenes) {
    if (openai) {
      try {
        const image = await openai.images.generate({
          model: "dall-e-3",
          prompt: `${scene.visualPrompt}. Vertical 9:16 cinematic still, filmic, no text overlay.${brand?.primary_color ? ` Colour grade towards ${brand.primary_color}.` : ""}`,
          size: "1024x1792",
          n: 1,
        });
        visuals.push({
          sceneId: scene.id,
          imageUrl: image.data?.[0]?.url || PLACEHOLDER_FRAMES[(scene.id - 1) % PLACEHOLDER_FRAMES.length],
          prompt: scene.visualPrompt,
        });
        provider = "openai";
        model = "dall-e-3";
        cost += 0.04;
        continue;
      } catch {
        // fall through to studio frames
      }
    }
    visuals.push({
      sceneId: scene.id,
      imageUrl: PLACEHOLDER_FRAMES[(scene.id - 1) % PLACEHOLDER_FRAMES.length],
      prompt: scene.visualPrompt,
    });
  }

  return { data: visuals, provider, model, cost };
}

export async function generateVoice(script: Script, brand?: BrandKit | null) {
  const spoken = script.scenes.map((s) => s.voiceover).join(" ");
  const fallback: Voiceover = {
    voice: brand?.tone_of_voice?.toLowerCase().includes("playful") ? "soft british female" : "warm british female",
    script: spoken,
    notes: "Natural pace. Pause after the hook. Never sound like an ad read.",
  };
  return jsonCompletion<Voiceover>(
    `Cast a voice for a 30s vertical film. Prefer British English unless the brand says otherwise.\n${brandContext(brand)}`,
    `Script: ${spoken}\nReturn JSON: { voice, script, notes }`,
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
