import { db } from "../db/index.js";
import type { LearnedSummary } from "./ai.js";

const STOP = new Set([
  "this",
  "that",
  "with",
  "from",
  "your",
  "reel",
  "still",
  "photo",
  "image",
  "cinematic",
  "vertical",
  "scene",
  "shot",
  "frame",
  "instagram",
  "prompt",
]);

function parse<T>(value: unknown): T | null {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function words(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOP.has(word));
}

export function readyCount(userId: string) {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND status IN ('ready', 'expired')`)
    .get(userId) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

function versions(userId: string, step: string) {
  return db
    .prepare(
      `SELECT psv.accepted, psv.rejection_reason, psv.payload_json, psv.project_id
       FROM project_step_versions psv
       JOIN projects p ON p.id = psv.project_id
       WHERE p.user_id = ? AND psv.step = ?`
    )
    .all(userId, step) as { accepted: number; rejection_reason: string | null; payload_json: string; project_id: string }[];
}

function ideaAvoid(userId: string) {
  const rejected = versions(userId, "idea").filter((row) => row.rejection_reason && row.rejection_reason !== "other");
  if (!rejected.length) return [] as string[];
  const counts = new Map<string, number>();
  for (const row of rejected) counts.set(row.rejection_reason!, (counts.get(row.rejection_reason!) || 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count / rejected.length >= 0.5)
    .map(([reason]) => reason);
}

function scriptPace(userId: string) {
  const rows = versions(userId, "script");
  const chars = (accepted: number) =>
    rows
      .filter((row) => Number(row.accepted) === accepted)
      .map((row) => {
        const script = parse<{ scenes?: { voiceover?: string }[] }>(row.payload_json);
        const scenes = script?.scenes || [];
        if (!scenes.length) return 0;
        return scenes.reduce((sum, scene) => sum + (scene.voiceover || "").length, 0) / scenes.length;
      })
      .filter((n) => n > 0);
  const accepted = chars(1);
  const rejected = chars(0);
  if (!accepted.length || !rejected.length) return "";
  if (median(accepted) < median(rejected) * 0.9) return "concise";
  return "";
}

function visualNotes(userId: string) {
  const rows = versions(userId, "visuals");
  const texts = (accepted: number) =>
    rows
      .filter((row) => Number(row.accepted) === accepted)
      .flatMap((row) => {
        const items = parse<{ prompt?: string }[] | { prompt?: string }>(row.payload_json);
        const list = Array.isArray(items) ? items : items ? [items] : [];
        return list.map((item) => item.prompt || "");
      });
  const acceptedFreq = new Map<string, number>();
  const rejectedFreq = new Map<string, number>();
  for (const text of texts(1)) for (const word of words(text)) acceptedFreq.set(word, (acceptedFreq.get(word) || 0) + 1);
  for (const text of texts(0)) for (const word of words(text)) rejectedFreq.set(word, (rejectedFreq.get(word) || 0) + 1);
  const keep = [...acceptedFreq.entries()]
    .filter(([word, count]) => count >= 2 && count > (rejectedFreq.get(word) || 0) * 1.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word);
  const avoid = [...rejectedFreq.entries()]
    .filter(([word, count]) => count >= 2 && count > (acceptedFreq.get(word) || 0) * 1.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([word]) => word);
  const parts = [...keep];
  if (avoid.length) parts.push(`avoid ${avoid.join(", ")}`);
  return parts.join(", ");
}

function preferredVoice(userId: string) {
  const projects = db
    .prepare(
      `SELECT id, voice_json FROM projects
       WHERE user_id = ? AND status IN ('ready', 'expired')
       ORDER BY updated_at ASC`
    )
    .all(userId) as { id: string; voice_json: string | null }[];
  let streak = 0;
  let preset = "";
  for (const project of projects) {
    const rejected = db
      .prepare(`SELECT id FROM project_step_versions WHERE project_id = ? AND step = 'voice' AND accepted = 0 LIMIT 1`)
      .get(project.id);
    const current = parse<{ voicePreset?: string }>(project.voice_json)?.voicePreset || "";
    if (!current || rejected) {
      streak = 0;
      preset = "";
      continue;
    }
    if (preset === current) streak += 1;
    else {
      preset = current;
      streak = 1;
    }
  }
  return streak >= 2 ? preset : "";
}

export function computeLearnedSummary(userId: string): LearnedSummary | null {
  const basedOnProjects = readyCount(userId);
  if (basedOnProjects < 3) return null;
  const summary: LearnedSummary = {
    generatedAt: new Date().toISOString(),
    basedOnProjects,
  };
  const avoid = ideaAvoid(userId);
  if (avoid.length) summary.avoid = avoid;
  const pace = scriptPace(userId);
  if (pace) summary.preferredPace = pace;
  const voice = preferredVoice(userId);
  if (voice) summary.preferredVoice = voice;
  const notes = visualNotes(userId);
  if (notes) summary.visualNotes = notes;
  return summary;
}

export function maybeRefreshLearnedSummary(userId: string, force = false) {
  const kit = db.prepare("SELECT id, learned_summary_json FROM brand_kits WHERE user_id = ?").get(userId) as
    | { id: string; learned_summary_json: string | null }
    | undefined;
  if (!kit) return;
  const n = readyCount(userId);
  if (n < 3) return;
  const current = parse<LearnedSummary>(kit.learned_summary_json);
  if (!force && n % 3 !== 0 && current) return;
  if (!force && current?.basedOnProjects === n) return;
  const summary = computeLearnedSummary(userId);
  db.prepare("UPDATE brand_kits SET learned_summary_json = ?, updated_at = datetime('now') WHERE id = ?").run(
    summary ? JSON.stringify(summary) : null,
    kit.id
  );
}

export function refreshDueLearnedSummaries() {
  const rows = db.prepare("SELECT user_id FROM brand_kits").all() as { user_id: string }[];
  for (const row of rows) maybeRefreshLearnedSummary(row.user_id, true);
}
