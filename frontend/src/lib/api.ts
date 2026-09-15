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
export type Project = {
  id: string;
  type: string;
  prompt: string;
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
  creditsUsed: number;
  stepAttempts: Record<string, number>;
  maxStepAttempts: number;
  maxRegenerates: number;
  createdAt: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem(TOKEN);
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new ApiError("Studio is offline. Start the API and try again.", 503);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error || "Request failed", res.status);
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
  createProject: (type: string, prompt: string) =>
    request<{ project: Project }>("/projects", { method: "POST", body: JSON.stringify({ type, prompt }) }),
  updatePrompt: (id: string, prompt: string) =>
    request<{ project: Project }>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify({ prompt }) }),
  runStep: (id: string, step: string, regenerate = false, sceneId?: number) =>
    request<{ project: Project }>(`/projects/${id}/steps/${step}`, {
      method: "POST",
      body: JSON.stringify({ regenerate, sceneId }),
    }),
  deleteAccount: () => request<{ ok: boolean }>("/auth/account", { method: "DELETE" }),
  brand: () => request<{ brandKit: Record<string, string> | null }>("/brand"),
  saveBrand: (body: Record<string, string>) =>
    request<{ brandKit: Record<string, string> }>("/brand", { method: "PUT", body: JSON.stringify(body) }),
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
  const token = localStorage.getItem(TOKEN);
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError("File not ready", res.status);
  return res.blob();
}
