import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";

export const STEP_REASONS: Record<string, string[]> = {
  idea: ["wrong_angle", "too_salesy", "not_our_audience", "boring_hook", "other"],
  script: ["too_long_short", "wrong_tone", "weak_cta", "not_our_voice", "other"],
  visuals: ["wrong_style", "wrong_colors", "doesnt_match_brand", "low_quality", "other"],
  voice: ["wrong_pace", "wrong_tone", "sounds_robotic", "wrong_gender_accent", "other"],
  captions: ["bad_timing", "hard_to_read", "other"],
};

export function parseStepFeedback(step: string, reasonRaw: unknown, noteRaw: unknown) {
  const reason = String(reasonRaw || "").trim();
  const note = String(noteRaw || "").trim().slice(0, 500);
  if (!reason) return { reason: "", note: "" };
  const allowed = STEP_REASONS[step];
  if (!allowed?.includes(reason)) {
    throw Object.assign(new Error("Unknown reason for this step."), { status: 400 });
  }
  if (reason === "other" && note.length < 2) {
    throw Object.assign(new Error("Say what was wrong — a few words is enough."), { status: 400 });
  }
  return { reason, note };
}

export function recordStepRejection(params: {
  projectId: string;
  step: string;
  sceneId?: number;
  reason?: string;
  note?: string;
}) {
  const { projectId, step, sceneId, reason, note } = params;
  const version = (
    sceneId
      ? db
          .prepare(
            `SELECT id FROM project_step_versions
             WHERE project_id = ? AND step = ? AND accepted = 1 AND (scene_id = ? OR scene_id IS NULL)
             ORDER BY CASE WHEN scene_id = ? THEN 0 ELSE 1 END, created_at DESC LIMIT 1`
          )
          .get(projectId, step, sceneId, sceneId)
      : db
          .prepare(
            `SELECT id FROM project_step_versions
             WHERE project_id = ? AND step = ? AND accepted = 1
             ORDER BY created_at DESC LIMIT 1`
          )
          .get(projectId, step)
  ) as { id: string } | undefined;
  if (!version || !reason) return;
  db.prepare("UPDATE project_step_versions SET rejection_reason = ? WHERE id = ?").run(reason, version.id);
  db.prepare(
    `INSERT INTO step_feedback (id, project_id, step, scene_id, version_id, reason, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), projectId, step, sceneId ?? null, version.id, reason, note || null);
}
