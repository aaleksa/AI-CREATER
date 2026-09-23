import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { v4 as uuid } from "uuid";
import { brandLogoType, hasBrandLogo, logoKindFromBytes, writeBrandLogo } from "../services/media.js";
import { maybeRefreshLearnedSummary, readyCount } from "../services/learning.js";

function hex(value: unknown, fallback: string) {
  const text = String(value || "");
  return /^#[0-9A-Fa-f]{6}$/.test(text) ? text : fallback;
}

const AVOID_COPY: Record<string, string> = {
  too_salesy: "Avoids overly salesy hooks",
  wrong_angle: "Avoids the same rejected angle",
  not_our_audience: "Avoids hooks that miss this audience",
  boring_hook: "Avoids flat or boring hooks",
};

function completeness(row: Record<string, unknown>, userId: string) {
  const checks = [
    { key: "colours", ok: true, hint: "add your colours" },
    { key: "font", ok: Boolean(String(row.font || "").trim()), hint: "choose a title type" },
    { key: "tone", ok: Boolean(String(row.tone_of_voice || "").trim()), hint: "pick a tone" },
    { key: "name", ok: Boolean(String(row.business_name || "").trim()), hint: "add your business name" },
    { key: "logo", ok: hasBrandLogo(userId) || Boolean(String(row.logo_url || "").trim()), hint: "add your logo for consistent branding" },
    { key: "type", ok: Boolean(String(row.vertical || "").trim()), hint: "say what you run" },
    { key: "website", ok: Boolean(String(row.website || "").trim()), hint: "add your website" },
    { key: "instagram", ok: Boolean(String(row.instagram || "").trim()), hint: "add your Instagram" },
  ];
  const done = checks.filter((item) => item.ok).length;
  const percent = Math.round((done / checks.length) * 100);
  const next = checks.find((item) => !item.ok);
  return {
    percent,
    hint: next ? `Brand kit ${percent}% complete — ${next.hint}` : `Brand kit ${percent}% complete`,
  };
}

function serializeBrand(row: Record<string, unknown> | undefined, userId: string) {
  if (!row) return null;
  let learned_summary = null as null | {
    generatedAt: string;
    basedOnProjects: number;
    avoid?: string[];
    preferredPace?: string;
    preferredVoice?: string;
    visualNotes?: string;
  };
  try {
    learned_summary = row.learned_summary_json ? JSON.parse(String(row.learned_summary_json)) : null;
  } catch {
    learned_summary = null;
  }
  const learned_lines: string[] = [];
  if (learned_summary && learned_summary.basedOnProjects >= 3) {
    for (const code of learned_summary.avoid || []) learned_lines.push(AVOID_COPY[code] || `Avoids ${code}`);
    if (learned_summary.preferredPace === "concise") learned_lines.push("Prefers concise voiceover");
    if (learned_summary.preferredVoice) {
      learned_lines.push(`${learned_summary.preferredVoice.replaceAll("_", " ")}`);
    }
    if (learned_summary.visualNotes) learned_lines.push(learned_summary.visualNotes);
  }
  const progress = completeness(row, userId);
  const logo = hasBrandLogo(userId) ? "/brand/logo" : String(row.logo_url || "");
  return {
    ...row,
    logo_url: logo,
    learned_summary,
    learned_lines,
    completeness: progress,
    ready_projects: readyCount(userId),
    ready: progress.percent >= 50,
  };
}

function kitOf(userId: string) {
  return db.prepare("SELECT * FROM brand_kits WHERE user_id = ?").get(userId) as Record<string, unknown> | undefined;
}

export const brandRouter = Router();
brandRouter.use(requireAuth);

brandRouter.get("/", (req, res) => {
  res.json({ brandKit: serializeBrand(kitOf(req.user!.id), req.user!.id) });
});

brandRouter.get("/logo", (req, res) => {
  const logo = brandLogoType(req.user!.id);
  if (!logo) {
    res.status(404).json({ error: "No logo yet." });
    return;
  }
  res.type(logo.type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(logo.file);
});

brandRouter.post("/logo", (req, res) => {
  const raw = String(req.body?.image || "");
  const match = raw.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!match) {
    res.status(400).json({ error: "Use a PNG or JPG under 2 MB. SVG is not allowed." });
    return;
  }
  const declared = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 2 * 1024 * 1024) {
    res.status(400).json({ error: "That file is too large. Keep it under 2 MB." });
    return;
  }
  const kind = logoKindFromBytes(buffer);
  if (!kind || (declared === "png" && kind !== "png") || (declared === "jpg" && kind !== "jpg")) {
    res.status(400).json({ error: "Use a PNG or JPG under 2 MB. SVG is not allowed." });
    return;
  }
  writeBrandLogo(req.user!.id, buffer, kind);
  db.prepare("UPDATE brand_kits SET logo_url = '/brand/logo', updated_at = datetime('now') WHERE user_id = ?").run(req.user!.id);
  res.json({ brandKit: serializeBrand(kitOf(req.user!.id), req.user!.id) });
});

brandRouter.post("/learning/reset", (req, res) => {
  db.prepare("UPDATE brand_kits SET learned_summary_json = NULL, updated_at = datetime('now') WHERE user_id = ?").run(req.user!.id);
  maybeRefreshLearnedSummary(req.user!.id, true);
  res.json({ brandKit: serializeBrand(kitOf(req.user!.id), req.user!.id) });
});

brandRouter.put("/", (req, res) => {
  const body = req.body ?? {};
  const verticalRaw = String(body.vertical ?? "");
  const vertical = ["salon", "cafe", "fitness", "other"].includes(verticalRaw) ? verticalRaw : "";
  const fields = {
    business_name: String(body.business_name ?? ""),
    logo_url: hasBrandLogo(req.user!.id) ? "/brand/logo" : String(body.logo_url ?? ""),
    primary_color: hex(body.primary_color, "#C45C26"),
    secondary_color: hex(body.secondary_color, "#F4EFE8"),
    font: String(body.font ?? "Fraunces"),
    tone_of_voice: String(body.tone_of_voice ?? ""),
    tone_note: String(body.tone_note ?? "").trim().slice(0, 400),
    website: String(body.website ?? ""),
    instagram: String(body.instagram ?? ""),
    vertical,
    vertical_note: vertical === "other" ? String(body.vertical_note ?? "").trim().slice(0, 80) : "",
  };
  const existing = db.prepare("SELECT id FROM brand_kits WHERE user_id = ?").get(req.user!.id) as { id: string } | undefined;
  if (existing) {
    db.prepare(
      `UPDATE brand_kits SET
        business_name=@business_name, logo_url=@logo_url, primary_color=@primary_color,
        secondary_color=@secondary_color, font=@font, tone_of_voice=@tone_of_voice, tone_note=@tone_note,
        website=@website, instagram=@instagram, vertical=@vertical, vertical_note=@vertical_note, updated_at=datetime('now')
       WHERE user_id=@user_id`
    ).run({ ...fields, user_id: req.user!.id });
  } else {
    db.prepare(
      `INSERT INTO brand_kits (id, user_id, business_name, logo_url, primary_color, secondary_color, font, tone_of_voice, tone_note, website, instagram, vertical, vertical_note)
       VALUES (@id, @user_id, @business_name, @logo_url, @primary_color, @secondary_color, @font, @tone_of_voice, @tone_note, @website, @instagram, @vertical, @vertical_note)`
    ).run({ id: uuid(), user_id: req.user!.id, ...fields });
  }
  res.json({ brandKit: serializeBrand(kitOf(req.user!.id), req.user!.id) });
});
