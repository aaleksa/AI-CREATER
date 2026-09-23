import { currentLocale, translateError } from "../i18n/locale";

const TOKEN = "auteur.token";

export type User = { id: string; email: string; name: string };
export type Me = {
  user: User;
  credits: number;
  subscription: { plan_id: string; plan_name: string; monthly_credits: number; status: string } | null;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type LearnedSummary = {
  generatedAt: string;
  basedOnProjects: number;
  avoid?: string[];
  preferredPace?: string;
  preferredVoice?: string;
  visualNotes?: string;
};
export type BrandKitRow = Record<string, string> & {
  learned_summary?: LearnedSummary | null;
  learned_lines?: string[];
  ready?: boolean;
  ready_projects?: number;
  completeness?: { percent: number; hint: string; nextKey?: string };
  tone_note?: string;
  vertical_note?: string;
};
export type Idea = {
  title: string;
  hook: string;
  concept: string;
  audience: string;
  visualDirection: string;
};
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
  address?: string;
  intro?: string;
  closing?: string;
  lines?: string[];
  program?: InviteItem[];
};
export type ScriptScene = {
  id: number;
  time: string;
  onScreen: string;
  voiceover: string;
  visualPrompt: string;
};
export type Project = {
  id: string;
  type: string;
  prompt: string;
  imageIntent?: string;
  useBrand?: boolean;
  invite?: InviteCard | null;
  status: string;
  currentStep: string;
  idea: Idea | null;
  script: { durationSec: number; cta: string; scenes: ScriptScene[] } | null;
  visuals: { sceneId: number; imageUrl: string; prompt: string; placeholder?: boolean }[] | null;
  voice: { voicePreset?: string; voice: string; script: string; notes: string } | null;
  captions: { cues: { start: number; end: number; text: string }[] } | null;
  audioUrl: string | null;
  outputUrl: string | null;
  hasVideo: boolean;
  hasImages: boolean;
  creditsUsed: number;
  stepAttempts: Record<string, number>;
  maxStepAttempts: number;
  maxRegenerates: number;
  extraAttemptMultiplier: number;
  runningStep: string | null;
  feedback: { publishable: string; reasons: string[] } | null;
  versions: {
    idea: StepVersion<Idea>[];
    script: StepVersion<{ durationSec: number; cta: string; scenes: ScriptScene[] }>[];
    visuals?: StepVersion<{ sceneId: number; imageUrl: string; prompt: string; placeholder?: boolean }[]>[];
  };
  previewUrl: string | null;
  previewExpiresAt: string | null;
  createdAt: string;
  updatedAt?: string;
};
export type StepVersion<T> = { id: string; accepted: boolean; createdAt: string; payload: T | null };

function localeHeaders(extra?: HeadersInit): HeadersInit {
  const token = localStorage.getItem(TOKEN);
  const locale = currentLocale();
  return {
    "Content-Type": "application/json",
    "Accept-Language": locale === "uk" ? "uk" : "en",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const locale = currentLocale();
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: localeHeaders(init?.headers),
    });
  } catch {
    throw new ApiError(translateError(locale, "Studio is offline. Start the API and try again."), 503);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(translateError(locale, data.error || "Request failed"), res.status);
  return data as T;
}

export const api = {
  signup: (body: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request<Me>("/auth/me"),
  projects: () => request<{ projects: Project[]; fullVideoCost: number }>("/projects"),
  project: (id: string) => request<{ project: Project; costs: Record<string, number>; fullVideoCost: number }>(`/projects/${id}`),
  createProject: (type: string, prompt: string, imageIntent?: string, useBrand = true) =>
    request<{ project: Project }>("/projects", { method: "POST", body: JSON.stringify({ type, prompt, imageIntent, useBrand }) }),
  deleteProject: (id: string) => request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
  updatePrompt: (id: string, prompt: string) =>
    request<{ project: Project }>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify({ prompt }) }),
  updateUseBrand: (id: string, useBrand: boolean) =>
    request<{ project: Project }>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify({ useBrand }) }),
  updateInvite: (id: string, invite: InviteCard) =>
    request<{ project: Project }>(`/projects/${id}/invite`, { method: "PATCH", body: JSON.stringify({ invite }) }),
  runStep: (
    id: string,
    step: string,
    regenerate = false,
    sceneId?: number,
    feedback?: { reason?: string; note?: string }
  ) => {
    const idempotencyKey = crypto.randomUUID();
    return request<{ project: Project }>(`/projects/${id}/steps/${step}`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        regenerate,
        sceneId,
        idempotencyKey,
        feedbackReason: feedback?.reason || undefined,
        feedbackNote: feedback?.note || undefined,
      }),
    });
  },
  saveFeedback: (id: string, publishable: string, reasons: string[]) =>
    request<{ project: Project }>(`/projects/${id}/feedback`, {
      method: "POST",
      body: JSON.stringify({ publishable, reasons }),
    }),
  sharePreview: (id: string) => request<{ url: string; expiresAt: string }>(`/projects/${id}/share`, { method: "POST" }),
  restoreVersion: (id: string, step: "idea" | "script" | "visuals", versionId: string, sceneId?: number) =>
    request<{ project: Project }>(`/projects/${id}/versions/${step}/${versionId}/restore`, {
      method: "POST",
      body: JSON.stringify(sceneId ? { sceneId } : {}),
    }),
  deleteAccount: () => request<{ ok: boolean }>("/auth/account", { method: "DELETE" }),
  brand: () => request<{ brandKit: BrandKitRow | null }>("/brand"),
  saveBrand: (body: Record<string, string>) =>
    request<{ brandKit: BrandKitRow }>("/brand", { method: "PUT", body: JSON.stringify(body) }),
  uploadLogo: (image: string) =>
    request<{ brandKit: BrandKitRow }>("/brand/logo", { method: "POST", body: JSON.stringify({ image }) }),
  deleteLogo: () => request<{ brandKit: BrandKitRow }>("/brand/logo", { method: "DELETE" }),
  resetLearning: () => request<{ brandKit: BrandKitRow }>("/brand/learning/reset", { method: "POST" }),
  plans: () =>
    request<{
      plans: { id: string; name: string; price_gbp: number; monthly_credits: number; description: string }[];
      packs: { id: string; credits: number; price_gbp: number; label: string }[];
      frozenPrices: boolean;
      costs: Record<string, number>;
      fullVideoCost: number;
    }>("/billing/plans"),
  credits: () =>
    request<{
      balance: { credits: number } | null;
      transactions: { id: string; amount: number; type: string; description: string; created_at: string }[];
      generations: { id: string; type: string; provider: string; model: string; actual_cost_gbp: number; credits_used: number; status: string; created_at: string }[];
      economics: {
        actualCostGbp: { text: number; image: number; tts: number; render: number; failed: number; retries: number; total: number };
        readyReels: number;
        costPerReadyReelGbp: number;
        note: string;
      };
    }>("/billing/credits"),
  checkout: (body: { planId?: string; packId?: string }) =>
    request<{ url: string; mode: string }>("/billing/checkout", { method: "POST", body: JSON.stringify(body) }),
};

export function saveSession(token: string) {
  localStorage.setItem(TOKEN, token);
}
export function clearSession() {
  localStorage.removeItem(TOKEN);
}
export function hasSession() {
  return Boolean(localStorage.getItem(TOKEN));
}

export function refreshMe() {
  window.dispatchEvent(new Event("auteur:refresh"));
}

export async function fetchMedia(path: string) {
  const locale = currentLocale();
  const token = localStorage.getItem(TOKEN);
  const res = await fetch(path, {
    headers: {
      "Accept-Language": locale === "uk" ? "uk" : "en",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new ApiError(translateError(locale, "File not ready"), res.status);
  return res.blob();
}
