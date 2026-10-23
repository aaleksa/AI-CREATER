import fs from "node:fs";
import { v4 as uuid } from "uuid";
import { brandImageUrls } from "./brandAssets.js";
import { exampleRefList, listExampleRefs, readExampleUpload, writeEditExample } from "./projectRefs.js";
import type { BrandImageFile } from "./brandAssets.js";
import { logoLook } from "./logoLook.js";
import { IMAGE_FORMATS, formatOfFile, parseImageFormat, resolveImageFormat, type ImageFormat } from "./imageFormats.js";
import { db } from "../db/index.js";
import { attemptCost, config, CREDIT_COSTS, EXTRA_ATTEMPT_MULTIPLIER, IMAGE_SLIDE_COUNT, MAX_STEP_ATTEMPTS, MAX_REGENERATES_PER_STEP, VISUAL_SCENE_CREDITS, visualMinLive } from "../config.js";
import { getBalance, refundCredits, spendCredits } from "./credits.js";
import {
  generateCaptions,
  captionsFromWordTimes,
  generateIdea,
  generateScript,
  generateVisuals,
  generateVoice,
  generateOneVisual,
  regenInstruction,
  stillPicturePrompt,
  emptyShot,
  keepWordsHonest,
  LOGO_POSITIONS,
  logoPositionOf,
  wantsLogoStamp,
  logoSpotRequest,
  rewriteStillLanguagePrompt,
  rewriteStillCopyPrompt,
  rewriteStillFormatPrompt,
  readPaintedCopy,
  translateBrief,
  translateScript,
  translatePictureCopy,
  tidyIdea,
  tidyVoice,
  type BrandKit,
  type CaptionCue,
  type Idea,
  type LogoBox,
  type LogoPosition,
  type LogoSpot,
  type PictureLanguage,
  type Shot,
  type Script,
  type Visual,
} from "./ai.js";
import {
  cleanStillFile,
  projectMediaDir,
  projectMediaPath,
  copySelectedStill,
  hasCleanStill,
  hasStillFile,
  keepCleanCopy,
  keepCleanStill,
  hasStillVersionFile,
  hasMusicFile,
  hasVideoFile,
  hasVoiceFile,
  persistStills,
  remixReelAudio,
  removeMusicFile,
  removeVideoFile,
  removeVoiceFile,
  renderReel,
  videoFile,
  writeMusicFromUpload,
  loadVoiceTake,
  loadVoiceTakeMeta,
  hasVoiceTake,
  voiceTakeKeyFor,
  saveTakeCaptions,
  saveVoiceTake,
  voiceTakeKey,
  voiceChoiceOf,
  voiceInstructions,
  voiceWordTimes,
  VOICE_CHOICES,
  type ReelMusic,
  unstampReelFrames,
  writeReelEndCard,
  writeReelLogoBadge,
  type ReelLogoSettings,
  CAPTION_STYLES,
  REEL_TITLE_SIZES,
  type ReelTitles,
  type CaptionStyle,
  restoreStillSnapshot,
  snapshotStills,
  brandMarkBox,
  brandMarkPath,
  brandMarkSpot,
  stampBrandMark,
  stillFile,
  stillVersionFile,
  synthesizeSpeech,
  voiceDurationSec,
} from "./media.js";
import { assertArchiveRoom, evictOverLimit } from "./archive.js";
import { inviteFrom, parseInvite, preferBriefInvite, type InviteCard } from "./invite.js";
import { parseCertificate, renderCertificate, withCodes, type CertificateSettings } from "./certificate.js";
import { parseStepFeedback, recordStepRejection } from "./feedback.js";
import { maybeRefreshLearnedSummary } from "./learning.js";
import { previewState } from "./share.js";
import { forOwner, USER_ERRORS } from "./userErrors.js";
import { emailUnverifiedError, needsVerification } from "./emailVerification.js";

export const FORMAT_TYPES = ["video", "instagram_reel", "tiktok", "image_post", "advertisement", "social_post"] as const;
export type FormatType = (typeof FORMAT_TYPES)[number];

export const MVP_READY: FormatType[] = ["instagram_reel", "tiktok", "image_post"];

export function isImagePost(type: string) {
  return type === "image_post";
}

export const IMAGE_INTENTS = ["photo", "invite", "info", "offer", "certificate"] as const;
export type ImageIntent = (typeof IMAGE_INTENTS)[number];

export function isInvitePoster(type: string, intent: string) {
  return isImagePost(type) && intent === "invite";
}

export function isTextPoster(type: string, intent: string) {
  return isImagePost(type) && (intent === "invite" || intent === "info" || intent === "offer");
}

export function parseImageIntent(type: string, raw: unknown): ImageIntent | "" {
  if (!isImagePost(type)) return "";
  if (typeof raw === "string" && (IMAGE_INTENTS as readonly string[]).includes(raw)) {
    return raw as ImageIntent;
  }
  return "photo";
}

export function readCreateImageIntent(type: string, raw: unknown): { intent: ImageIntent | "" } | { error: string } {
  if (!isImagePost(type)) return { intent: "" };
  if (raw == null || raw === "") return { intent: "photo" };
  if (typeof raw === "string" && (IMAGE_INTENTS as readonly string[]).includes(raw)) {
    return { intent: raw as ImageIntent };
  }
  return { error: "Choose photo, invitation, information or offer." };
}

/** The language a picture version was made in, read from its prompt; null when the prompt does not say. */
function languageOfPrompt(prompt: string): PictureLanguage | null {
  if (/Translate the text in this image to English|Translate the whole brief into English first/.test(prompt)) return "en";
  if (/Translate the text in this image to Ukrainian|Translate the whole brief into Ukrainian first/.test(prompt)) return "uk";
  if (/Same language as the request/.test(prompt)) return "";
  return null;
}

/**
 * The words' language of the picture shown now: the chosen version's own, or (for an edit, a new shape or a logo
 * version) the one it was made from. Null when nothing says — then the post's setting stands.
 */
function chosenPictureLanguage(projectId: string): PictureLanguage | null {
  const rows = db
    .prepare("SELECT accepted, payload_json FROM project_step_versions WHERE project_id = ? AND step = 'visuals' ORDER BY rowid")
    .all(projectId) as { accepted: number; payload_json: string }[];
  let index = -1;
  rows.forEach((row, i) => {
    if (Number(row.accepted) === 1) index = i;
  });
  for (let i = index; i >= 0; i--) {
    const frame = (parse<Visual[]>(rows[i].payload_json) || []).find((item) => item.sceneId === 1);
    const lang = languageOfPrompt(String(frame?.prompt || ""));
    if (lang !== null) return lang;
  }
  return null;
}

export function parsePictureLanguage(raw: unknown): PictureLanguage {
  if (raw === "en" || raw === "uk") return raw;
  return "";
}

export function readCreatePictureLanguage(
  type: string,
  intent: ImageIntent | "",
  raw: unknown
): { language: PictureLanguage } | { error: string } {
  if (!isTextPoster(type, intent) && intent !== "certificate") return { language: "" };
  if (raw == null || raw === "") return { language: "" };
  if (raw === "en" || raw === "uk") return { language: raw };
  return { error: "Choose English, Ukrainian, or follow the brief." };
}

export function readCreateImageFormat(
  type: string,
  intent: ImageIntent | "",
  raw: unknown
): { format: (typeof IMAGE_FORMATS)[number] | "" } | { error: string } {
  if (type !== "image_post") return { format: "" };
  // A gift certificate is printed: always A5 landscape.
  if (intent === "certificate") return { format: "a5" };
  if (raw == null || raw === "") return { format: isTextPoster(type, intent) ? "portrait" : "square" };
  const format = parseImageFormat(raw);
  if (!format) return { error: "Choose where the picture will be posted." };
  return { format };
}

function imageCarousel(
  prompt: string,
  idea: Idea,
  intent: ImageIntent | "" = "photo",
  feedback?: { reason?: string; note?: string },
  brand?: BrandKit | null,
  pictureLanguage: PictureLanguage = "",
  invite?: InviteCard | null
): Script {
  const kind = intent || "photo";
  return {
    durationSec: 0,
    cta: idea.title,
    scenes: [
      {
        id: 1,
        time: "Picture",
        onScreen: "Finished picture",
        voiceover: "",
        visualPrompt: stillPicturePrompt(
          prompt,
          idea,
          "one finished picture from the whole brief",
          1,
          1,
          kind,
          feedback,
          brand,
          pictureLanguage,
          invite
        ),
      },
    ],
  };
}

function logGeneration(params: {
  userId: string;
  projectId: string;
  type: string;
  provider: string;
  model: string;
  cost: number;
  credits: number;
  status: string;
  meta?: unknown;
  idempotencyKey?: string;
}) {
  const id = uuid();
  const started = new Date().toISOString();
  db.prepare(
    `INSERT INTO ai_generations
      (id, user_id, project_id, type, provider, model, actual_cost_gbp, credits_used, status, meta_json, idempotency_key, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.userId,
    params.projectId,
    params.type,
    params.provider,
    params.model,
    params.cost,
    params.credits,
    params.status,
    params.meta ? JSON.stringify(params.meta) : null,
    params.idempotencyKey || null,
    started
  );
  return { id, started };
}

function finishGeneration(
  id: string,
  started: string,
  fields: { provider: string; model: string; actualCost: number; credits: number; status: string; meta?: unknown }
) {
  const finished = new Date().toISOString();
  db.prepare(
    `UPDATE ai_generations
     SET provider = ?, model = ?, actual_cost_gbp = ?, credits_used = ?, status = ?, meta_json = ?, finished_at = ?, duration_ms = ?
     WHERE id = ?`
  ).run(
    fields.provider,
    fields.model,
    fields.actualCost,
    fields.credits,
    fields.status,
    fields.meta ? JSON.stringify(fields.meta) : null,
    finished,
    Date.now() - Date.parse(started),
    id
  );
}

function saveStepVersion(projectId: string, step: string, payload: unknown, generationId: string, sceneId?: number) {
  const id = uuid();
  const parentStep = step === "script" ? "idea" : step === "visuals" ? "script" : "";
  const parent = parentStep
    ? (db
        .prepare("SELECT id FROM project_step_versions WHERE project_id = ? AND step = ? AND accepted = 1 ORDER BY rowid DESC LIMIT 1")
        .get(projectId, parentStep) as { id: string } | undefined)
    : undefined;
  if (step === "visuals") {
    db.prepare("UPDATE project_step_versions SET accepted = 0 WHERE project_id = ? AND step = 'visuals'").run(projectId);
  } else if (sceneId) {
    db.prepare("UPDATE project_step_versions SET accepted = 0 WHERE project_id = ? AND step = ? AND scene_id = ?").run(
      projectId,
      step,
      sceneId
    );
  } else {
    db.prepare("UPDATE project_step_versions SET accepted = 0 WHERE project_id = ? AND step = ?").run(projectId, step);
  }
  db.prepare(
    `INSERT INTO project_step_versions (id, project_id, step, scene_id, payload_json, accepted, generation_id, parent_id)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(id, projectId, step, sceneId ?? null, JSON.stringify(payload), generationId, parent?.id ?? null);
  return id;
}

/** The words printed on a gift certificate and the people it is for. */
function certificateOf(row: Record<string, unknown>): CertificateSettings {
  const lang = row.picture_language === "en" || row.picture_language === "uk"
    ? row.picture_language
    : /[\u0400-\u04FF]/.test(String(row.prompt || "")) ? "uk" : "en";
  const saved = parse<unknown>(row.certificate_json as string | null);
  const settings = parseCertificate(saved, lang as "uk" | "en");
  return settings.items.length ? settings : { ...settings, items: [{ name: "", gift: "", validUntil: "", code: "" }] };
}

/** Saves the certificate words and the list of people (codes filled in); free, nothing is painted. */
export function updateCertificate(userId: string, projectId: string, raw: unknown) {
  const project = getProject(projectId, userId);
  if (project.image_intent !== "certificate") throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  const settings = withCodes(parseCertificate(raw, certificateOf(project).lang));
  db.prepare("UPDATE projects SET certificate_json = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(settings), projectId);
  return serializeProject(getProject(projectId, userId));
}

/** One person's certificate as a print PNG, a PDF or a small preview — our words on the painted design. */
export async function certificateFile(userId: string, projectId: string, index: number, format: "png" | "pdf" | "preview") {
  const project = getProject(projectId, userId);
  if (project.image_intent !== "certificate") throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  const settings = certificateOf(project);
  const brand = Number(project.use_brand) === 0 ? null : brandFor(userId);
  const file = await renderCertificate(projectId, settings, Math.max(0, Math.min(index, settings.items.length - 1)), brand, format);
  const item = settings.items[index];
  return { ...file, name: [item?.name || "certificate", settings.codes ? item?.code : ""].filter(Boolean).join("-") };
}

function brandFor(userId: string): BrandKit | null {
  const row = db.prepare("SELECT * FROM brand_kits WHERE user_id = ?").get(userId) as BrandKit | undefined;
  if (!row) return null;
  const images = brandImageUrls(userId);
  return {
    ...row,
    user_id: userId,
    logo_url: images.logo_url || row.logo_url || "",
    ref_place_url: images.ref_place_url,
    ref_people_url: images.ref_people_url,
    ref_product_url: images.ref_product_url,
    font_url: images.font_url,
  };
}

function getProject(id: string, userId: string) {
  const project = db.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(id, userId) as Record<string, unknown> | undefined;
  if (!project) {
    const err = new Error("Project not found.") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return project;
}

function parse<T>(value: unknown): T | null {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

const STEP_TYPES = ["idea", "script", "visuals", "voice", "captions", "render"] as const;

function stepAttemptCount(projectId: string, step: string) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM ai_generations
       WHERE project_id = ? AND type = ? AND status IN ('succeeded', 'running')`
    )
    .get(projectId, step) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

/** Tries of one frame: the set it came in, plus each time this very frame was made again. */
function frameAttemptCount(projectId: string, sceneId: number) {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM project_step_versions WHERE project_id = ? AND step = 'visuals' AND scene_id = ?`)
    .get(projectId, sceneId) as { n: number } | undefined;
  return 1 + Number(row?.n ?? 0);
}

function frameAttemptCounts(projectId: string) {
  const rows = db
    .prepare(
      `SELECT scene_id, COUNT(*) AS n FROM project_step_versions WHERE project_id = ? AND step = 'visuals' AND scene_id IS NOT NULL GROUP BY scene_id`
    )
    .all(projectId) as { scene_id: number; n: number }[];
  return Object.fromEntries(rows.map((row) => [String(row.scene_id), 1 + Number(row.n)]));
}

function stepAttemptCounts(projectId: string) {
  const rows = db
    .prepare(
      `SELECT type, COUNT(*) AS n FROM ai_generations
       WHERE project_id = ? AND type IN ('idea', 'script', 'visuals', 'voice', 'captions', 'render')
         AND status IN ('succeeded', 'running')
       GROUP BY type`
    )
    .all(projectId) as { type: string; n: number }[];
  const counts = Object.fromEntries(STEP_TYPES.map((step) => [step, 0])) as Record<(typeof STEP_TYPES)[number], number>;
  for (const row of rows) {
    if (row.type in counts) counts[row.type as (typeof STEP_TYPES)[number]] = Number(row.n);
  }
  return counts;
}

function slimVersionPayload(step: string, payload: unknown) {
  if (step !== "visuals" || !Array.isArray(payload)) return payload;
  return payload.map((item) => {
    const visual = item as { imageUrl?: string };
    if (visual.imageUrl && visual.imageUrl.startsWith("data:")) {
      return { ...visual, imageUrl: "" };
    }
    return item;
  });
}

type VersionRow = {
  id: string;
  payload_json: string;
  accepted: number;
  created_at: string;
  generation_id: string | null;
  parent_id?: string | null;
  seq?: number;
};

function versionRows(projectId: string, step: string) {
  return db
    .prepare(
      `SELECT id, payload_json, accepted, created_at, generation_id, parent_id, rowid AS seq FROM project_step_versions
       WHERE project_id = ? AND step = ? ORDER BY created_at ASC, rowid ASC`
    )
    .all(projectId, step) as VersionRow[];
}

/**
 * The latest script made under this idea. Versions saved before scripts remembered their idea are matched by order:
 * the scripts that came after this idea and before the next one.
 */
function latestScriptOfIdea(projectId: string, ideaId: string) {
  const ideas = versionRows(projectId, "idea");
  const scripts = versionRows(projectId, "script");
  const linked = scripts.filter((row) => row.parent_id === ideaId);
  if (linked.length) return linked[linked.length - 1];
  const index = ideas.findIndex((row) => row.id === ideaId);
  if (index < 0) return null;
  const from = Number(ideas[index].seq);
  const to = index + 1 < ideas.length ? Number(ideas[index + 1].seq) : Infinity;
  const inWindow = scripts.filter((row) => !row.parent_id && Number(row.seq) > from && Number(row.seq) < to);
  return inWindow.length ? inWindow[inWindow.length - 1] : null;
}

/** What of a script's continuation is already made: its frames, and a voice for exactly its words (with captions). */
function continuationOf(projectId: string, project: Record<string, unknown>, script: Script | null) {
  if (!script) return { frames: false, voice: false, captions: false };
  const current = parse<Script>(project.script_json as string);
  const sameFrames =
    Boolean(current) &&
    Boolean(parse<Visual[]>(project.visuals_json as string)?.length) &&
    current!.scenes.length === script.scenes.length &&
    current!.scenes.every((scene, i) => scene.id === script.scenes[i].id && (scene.visualPrompt || "").trim() === (script.scenes[i].visualPrompt || "").trim());
  const frames = sameFrames || Boolean(framesForScript(projectId, script));
  const voice = voiceChoiceOf(project.voice_choice);
  const key = voiceTakeKey(script, voice);
  const take = loadVoiceTakeMeta(projectId, voiceTakeKeyFor(projectId, script, voice));
  const sameVoice = Boolean(current) && voiceTakeKey(current!, voice) === key && hasVoiceFile(projectId);
  return { frames, voice: Boolean(take) || sameVoice, captions: Boolean(take?.captions) || (sameVoice && Boolean(project.captions_json)) };
}

/**
 * The picture as the model returned it, before any logo we stamped. Versions we make ourselves (logo on / off) have no
 * generation, so we walk back to the nearest version the model made.
 */
function modelPictureFor(projectId: string, rows: VersionRow[], index: number, sceneId: number) {
  // A logo version keeps the clean copy of the picture it was stamped on: that one wins, so a version brought back
  // from further up the list is not swapped for whichever generated picture sits nearest above it.
  for (let i = Math.min(index, rows.length - 1); i >= 0; i--) {
    const own = (parse<Visual[]>(rows[i]?.payload_json || "") || []).find((item) => item.sceneId === sceneId);
    if (own?.clean && hasCleanStill(projectId, own.clean)) return { file: cleanStillFile(projectId, own.clean), frame: own };
    if (rows[i]?.generation_id) break;
  }
  let base = rows[0];
  for (let i = index; i >= 0; i--) {
    if (rows[i]?.generation_id) {
      base = rows[i];
      break;
    }
  }
  const frame = (parse<Visual[]>(base?.payload_json || "") || []).find((item) => item.sceneId === sceneId);
  const file =
    frame?.clean && hasCleanStill(projectId, frame.clean)
      ? cleanStillFile(projectId, frame.clean)
      : base && hasStillVersionFile(projectId, sceneId, base.id)
        ? stillVersionFile(projectId, sceneId, base.id)
        : "";
  return { file, frame };
}

function sameFile(a: string, b: string) {
  if (!a || !b || !fs.existsSync(a) || !fs.existsSync(b)) return false;
  if (fs.statSync(a).size !== fs.statSync(b).size) return false;
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

/** True when this picture carries a logo we put on, so it can come off without AI. */
function hasOurLogo(projectId: string, rows: VersionRow[], index: number) {
  const frame = (parse<Visual[]>(rows[index].payload_json) || [])[0];
  if (!frame || frame.placeholder) return false;
  if (frame.clean) return true;
  if (rows[index].generation_id) return false;
  const base = modelPictureFor(projectId, rows, index, frame.sceneId);
  const file = stillVersionFile(projectId, frame.sceneId, rows[index].id);
  return Boolean(base.file) && fs.existsSync(file) && !sameFile(base.file, file);
}

/** Shape of the take as it really is on disk (takes made before a shape change keep their own). */
function versionShape(projectId: string, row: VersionRow) {
  const frame = (parse<Visual[]>(row.payload_json) || [])[0];
  return frame && !frame.placeholder ? formatOfFile(stillVersionFile(projectId, frame.sceneId, row.id)) : "";
}

function lastVersions(projectId: string, step: string, project?: Record<string, unknown>) {
  const rows = versionRows(projectId, step);
  const reel = project && !isImagePost(String(project.type));
  return rows.map((row, index) => ({
    id: row.id,
    accepted: Number(row.accepted) === 1,
    createdAt: row.created_at,
    payload: slimVersionPayload(step, parse(row.payload_json)),
    ...(step === "visuals" ? { ourLogo: hasOurLogo(projectId, rows, index), shape: versionShape(projectId, row) } : {}),
    ...(reel && step === "script" ? { keeps: continuationOf(projectId, project!, parse<Script>(row.payload_json)) } : {}),
    ...(reel && step === "idea"
      ? (() => {
          const child = latestScriptOfIdea(projectId, row.id);
          return { keeps: { script: Boolean(child), ...continuationOf(projectId, project!, child ? parse<Script>(child.payload_json) : null) } };
        })()
      : {}),
  }));
}

function tidyScript(script: Script | null) {
  if (!script?.scenes) return script;
  return {
    ...script,
    scenes: script.scenes.map((scene) => ({
      ...scene,
      onScreen: String(scene.onScreen || "")
        .replace(/([a-zа-яіїєґ])([A-ZА-ЯІЇЄҐ])/g, "$1 $2")
        .replace(/^(title|end)\s*card\s*:?\s*/i, "")
        .replace(/\s+/g, " ")
        .trim(),
      voiceover: String(scene.voiceover || "")
        .replace(/([a-zа-яіїєґ])([A-ZА-ЯІЇЄҐ])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim(),
    })),
  };
}

export function serializeProject(row: Record<string, unknown>) {
  const id = String(row.id);
  const running = db
    .prepare("SELECT type FROM ai_generations WHERE project_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1")
    .get(id) as { type: string } | undefined;
  const feedback = db
    .prepare(
      "SELECT publishable, reasons_json FROM project_feedback WHERE project_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(id) as { publishable: string; reasons_json: string } | undefined;
  return {
    id: row.id,
    type: row.type,
    prompt: row.prompt,
    imageIntent: row.image_intent || "",
    pictureLanguage:
      isTextPoster(String(row.type), String(row.image_intent || "")) ? chosenPictureLanguage(id) ?? parsePictureLanguage(row.picture_language) : parsePictureLanguage(row.picture_language),
    imageFormat: String(row.type) === "image_post" ? resolveImageFormat(isTextPoster(String(row.type), String(row.image_intent || "photo")) ? "poster" : "still", row.image_format) : "",
    useBrand: Number(row.use_brand) !== 0,
    refs: exampleRefList(id),
    invite: row.invite_json ? parseInvite(parse(row.invite_json)) : null,
    certificate: row.image_intent === "certificate" ? certificateOf(row) : null,
    status: running ? "generating" : row.status,
    currentStep: row.current_step,
    runningStep: running?.type || null,
    idea: tidyIdea(parse(row.idea_json)),
    script: tidyScript(parse(row.script_json)),
    visuals: slimVersionPayload("visuals", parse(row.visuals_json)),
    voice: tidyVoice(parse(row.voice_json)),
    captions: parse(row.captions_json),
    audioUrl: hasVoiceFile(id) ? `/projects/${id}/audio` : null,
    voiceOff: Number(row.voice_off) === 1,
    captionsOff: Number(row.captions_off) === 1,
    outputUrl: hasVideoFile(id) ? `/projects/${id}/file` : row.output_url || null,
    hasVideo: hasVideoFile(id),
    /** Changes when the video file is replaced (e.g. new music), so the page loads it again. */
    videoStamp: hasVideoFile(id) ? Math.round(fs.statSync(videoFile(id)).mtimeMs) : 0,
    reelLogo: parse<Partial<ReelLogoSettings>>(row.reel_logo_json),
    captionStyle: captionStyleOf(row),
    reelTitles: reelTitlesOf(row),
    voiceChoice: voiceChoiceOf(row.voice_choice),
    /** Voice is off but its recording for these words and this voice is still kept, so bringing it back is free. */
    voiceTakeSaved:
      Number(row.voice_off) === 1 && Boolean(row.script_json)
        ? hasVoiceTake(id, voiceTakeKeyFor(id, parse<Script>(row.script_json)!, voiceChoiceOf(row.voice_choice)))
        : false,
    renderPaid: renderPaidBefore(id) || hasVideoFile(id),
    music: hasMusicFile(id)
      ? { name: String(row.music_name || ""), durationSec: Number(row.music_duration) || 0, ...reelMusicOf(row) }
      : null,
    hasImages: isImagePost(String(row.type)) && Boolean(parse(row.visuals_json)) && hasStillFile(id, 1),
    creditsUsed: row.credits_used,
    stepAttempts: stepAttemptCounts(id),
    frameAttempts: frameAttemptCounts(id),
    maxStepAttempts: MAX_STEP_ATTEMPTS,
    maxRegenerates: MAX_REGENERATES_PER_STEP,
    extraAttemptMultiplier: EXTRA_ATTEMPT_MULTIPLIER,
    feedback: feedback
      ? { publishable: feedback.publishable, reasons: parse<string[]>(feedback.reasons_json) || [] }
      : null,
    versions: {
      idea: lastVersions(id, "idea", row),
      script: lastVersions(id, "script", row),
      visuals: lastVersions(id, "visuals"),
    },
    ...previewState(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function restoreStepVersion(
  userId: string,
  projectId: string,
  step: "idea" | "script" | "visuals",
  versionId: string,
  sceneId?: number
) {
  const project = getProject(projectId, userId);
  const version = db
    .prepare("SELECT id, payload_json, accepted, scene_id FROM project_step_versions WHERE id = ? AND project_id = ? AND step = ?")
    .get(versionId, projectId, step) as
    | { id: string; payload_json: string; accepted: number; scene_id: number | null }
    | undefined;
  if (!version) throw Object.assign(new Error("That version is gone."), { status: 404 });
  if (Number(version.accepted) === 1 && step !== "visuals") return serializeProject(project);
  const hadVideoBefore = hasVideoFile(projectId);

  if (step === "visuals") {
    const snapshot = parse<Visual[]>(version.payload_json);
    const current = parse<Visual[]>(project.visuals_json) || [];
    if (!snapshot?.length) throw Object.assign(new Error("That picture is gone."), { status: 404 });
    const target = sceneId || version.scene_id;
    const next = target
      ? (() => {
          const frame = snapshot.find((item) => item.sceneId === target);
          if (!frame) throw Object.assign(new Error("That picture is gone."), { status: 404 });
          return current.some((item) => item.sceneId === target)
            ? current.map((item) => (item.sceneId === target ? frame : item))
            : [...current, frame];
        })()
      : snapshot;
    restoreStillSnapshot(projectId, version.id, next, target ? [target] : undefined);
    db.prepare("UPDATE project_step_versions SET accepted = 0 WHERE project_id = ? AND step = 'visuals'").run(projectId);
    db.prepare("UPDATE project_step_versions SET accepted = 1 WHERE id = ?").run(version.id);
    const ready = isImagePost(String(project.type));
    const chosenLang = ready ? chosenPictureLanguage(projectId) : null;
    if (chosenLang !== null && isTextPoster(String(project.type), String(project.image_intent || ""))) {
      db.prepare("UPDATE projects SET picture_language = ? WHERE id = ?").run(chosenLang, projectId);
    }
    db.prepare(
      `UPDATE projects SET visuals_json = ?, output_url = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(next), ready ? `/projects/${projectId}/image/1` : null, ready ? "ready" : "draft", projectId);
    // An older take may have another shape: the project follows the picture that is now on screen.
    const shape = ready && next[0] ? formatOfFile(stillFile(projectId, next[0].sceneId)) : "";
    if (shape && shape !== "tall") db.prepare("UPDATE projects SET image_format = ? WHERE id = ?").run(shape, projectId);
    // A Reel keeps its video and gets it made again with the frame that is back (free).
    if (!ready) await settleVideo(userId, projectId, hadVideoBefore);
    return serializeProject(getProject(projectId, userId));
  }

  if (Number(version.accepted) === 1) return serializeProject(project);
  const reel = !isImagePost(String(project.type));
  db.prepare("UPDATE project_step_versions SET accepted = 0 WHERE project_id = ? AND step = ?").run(projectId, step);
  db.prepare("UPDATE project_step_versions SET accepted = 1 WHERE id = ?").run(version.id);

  // An idea brings its own continuation: its latest script, then whatever that script already had.
  const scriptRow = step === "script" ? (version as unknown as VersionRow) : reel ? latestScriptOfIdea(projectId, version.id) : null;
  if (step === "idea") db.prepare(`UPDATE projects SET idea_json = ? WHERE id = ?`).run(version.payload_json, projectId);
  if (!scriptRow) {
    // No script under that idea yet: everything after the idea is made again.
    const updates: Record<string, unknown> = { ...downstreamWipe("idea"), updated_at: new Date().toISOString() };
    delete updates.output_url;
    delete updates.status;
    keepCurrentVoice(projectId);
    removeVoiceFile(projectId);
    const fields = Object.keys(updates).map((key) => `${key} = @${key}`).join(", ");
    db.prepare(`UPDATE projects SET ${fields} WHERE id = @id`).run({ ...updates, id: projectId });
    await settleVideo(userId, projectId, hadVideoBefore);
    if (!hasVideoFile(projectId)) db.prepare(`UPDATE projects SET status = 'draft', output_url = NULL WHERE id = ?`).run(projectId);
    return serializeProject(getProject(projectId, userId));
  }
  if (step === "idea") {
    db.prepare("UPDATE project_step_versions SET accepted = 0 WHERE project_id = ? AND step = 'script'").run(projectId);
    db.prepare("UPDATE project_step_versions SET accepted = 1 WHERE id = ?").run(scriptRow.id);
  }
  const fresh = getProject(projectId, userId);
  const current = parse<Script>(fresh.script_json);
  const older = parse<Script>(scriptRow.payload_json);
  const sameScenes =
    reel &&
    Boolean(current && older) &&
    current!.scenes.length === older!.scenes.length &&
    // The frames were painted from these descriptions: only the very same ones keep them valid.
    current!.scenes.every(
      (scene, i) => scene.id === older!.scenes[i].id && (scene.visualPrompt || "").trim() === (older!.scenes[i].visualPrompt || "").trim()
    );
  // Same scenes and frame descriptions (e.g. an earlier hand edit or a translation): only what depends on the words is
  // made again; the frames stay.
  if (sameScenes) return await editScript(userId, projectId, older, { saveVersion: false });
  const wipe = downstreamWipe("script");
  // Frames already painted for that script come back too, free: the latest set whose descriptions match it.
  const framesBack = older && reel ? framesForScript(projectId, older) : null;
  const updates: Record<string, unknown> = {
    script_json: scriptRow.payload_json,
    ...wipe,
    ...(framesBack ? { visuals_json: JSON.stringify(framesBack.visuals) } : {}),
    updated_at: new Date().toISOString(),
  };
  delete updates.output_url;
  delete updates.status;
  if (framesBack) {
    restoreStillSnapshot(projectId, framesBack.versionId, framesBack.visuals);
    db.prepare("UPDATE project_step_versions SET accepted = 0 WHERE project_id = ? AND step = 'visuals'").run(projectId);
    db.prepare("UPDATE project_step_versions SET accepted = 1 WHERE id = ?").run(framesBack.versionId);
  }
  keepCurrentVoice(projectId);
  removeVoiceFile(projectId);
  // A voice already recorded for exactly that script's words comes back free, with its captions.
  if (older && Number(fresh.voice_off) !== 1) {
    const take = loadVoiceTake(projectId, voiceTakeKeyFor(projectId, older, voiceChoiceOf(fresh.voice_choice)));
    if (take) {
      updates.voice_json = take.voice ? JSON.stringify(take.voice) : null;
      updates.audio_url = `/projects/${projectId}/audio`;
      if (Number(fresh.captions_off) !== 1 && take.captions) updates.captions_json = JSON.stringify(take.captions);
    }
  }
  // Without a voice the captions are the scenes' own words: made right here, free.
  if (older && Number(fresh.voice_off) === 1 && Number(fresh.captions_off) !== 1) {
    updates.captions_json = JSON.stringify({ cues: sceneCaptions(older) });
  }
  const fields = Object.keys(updates)
    .map((key) => `${key} = @${key}`)
    .join(", ");
  db.prepare(`UPDATE projects SET ${fields} WHERE id = @id`).run({ ...updates, id: projectId });
  await settleVideo(userId, projectId, hadVideoBefore);
  if (!hasVideoFile(projectId)) db.prepare(`UPDATE projects SET status = 'draft', output_url = NULL WHERE id = ?`).run(projectId);
  return serializeProject(getProject(projectId, userId));
}

/**
 * "Try as a new Reel": a copy of this Reel that starts from one idea or script version, with whatever was already
 * made for it — its frames, a voice for its words and the captions from that voice — plus the brief's example
 * pictures, music and look settings. The original Reel stays exactly as it is. Free: nothing is generated.
 */
export function forkReel(userId: string, projectId: string, rawStep: unknown, versionId: string) {
  const project = getProject(projectId, userId);
  if (isImagePost(String(project.type))) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  const step = rawStep === "idea" ? "idea" : rawStep === "script" ? "script" : "";
  if (!step) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  const version = db
    .prepare("SELECT id, payload_json, parent_id FROM project_step_versions WHERE id = ? AND project_id = ? AND step = ?")
    .get(versionId, projectId, step) as { id: string; payload_json: string; parent_id: string | null } | undefined;
  if (!version) throw Object.assign(new Error("That version is gone."), { status: 404 });
  const scriptRow = step === "script" ? version : latestScriptOfIdea(projectId, version.id);
  const ideaJson =
    step === "idea"
      ? version.payload_json
      : version.parent_id
        ? (db.prepare("SELECT payload_json FROM project_step_versions WHERE id = ?").get(version.parent_id) as { payload_json: string } | undefined)?.payload_json ||
          (project.idea_json as string)
        : (project.idea_json as string);
  const script = scriptRow ? parse<Script>(scriptRow.payload_json) : null;

  const newId = uuid();
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    ...project,
    id: newId,
    idea_json: ideaJson,
    script_json: scriptRow ? scriptRow.payload_json : null,
    visuals_json: null,
    voice_json: null,
    captions_json: null,
    audio_url: "",
    output_url: null,
    status: "draft",
    current_step: scriptRow ? "script" : "idea",
    credits_used: 0,
    created_at: now,
    updated_at: now,
    preview_token: null,
    preview_expires_at: null,
  };
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO projects (${keys.join(",")}) VALUES (${keys.map((key) => "@" + key).join(",")})`).run(row);

  const from = projectMediaPath(projectId);
  const to = projectMediaDir(newId);
  if (fs.existsSync(from)) {
    for (const name of fs.readdirSync(from)) {
      if (name.startsWith("example-") || name === "music.m4a") fs.copyFileSync(`${from}/${name}`, `${to}/${name}`);
    }
  }
  const insertVersion = (stepName: string, payload: string, parentId: string | null) => {
    const vid = uuid();
    db.prepare(
      `INSERT INTO project_step_versions (id, project_id, step, scene_id, payload_json, accepted, generation_id, parent_id) VALUES (?, ?, ?, NULL, ?, 1, '', ?)`
    ).run(vid, newId, stepName, payload, parentId);
    return vid;
  };
  const ideaVersion = ideaJson ? insertVersion("idea", ideaJson, null) : null;
  const scriptVersion = scriptRow ? insertVersion("script", scriptRow.payload_json, ideaVersion) : null;

  const updates: Record<string, unknown> = {};
  const frames = script ? framesForScript(projectId, script) : null;
  if (frames) {
    const framesVersion = insertVersion("visuals", JSON.stringify(frames.visuals), scriptVersion);
    for (const visual of frames.visuals) {
      const src = stillVersionFile(projectId, visual.sceneId, frames.versionId);
      if (!fs.existsSync(src)) continue;
      fs.copyFileSync(src, stillFile(newId, visual.sceneId));
      fs.copyFileSync(src, stillVersionFile(newId, visual.sceneId, framesVersion));
      if (visual.clean && fs.existsSync(cleanStillFile(projectId, visual.clean))) {
        fs.copyFileSync(cleanStillFile(projectId, visual.clean), cleanStillFile(newId, visual.clean));
      }
    }
    updates.visuals_json = JSON.stringify(frames.visuals);
    updates.current_step = "visuals";
  }
  if (script && Number(project.voice_off) !== 1) {
    const key = voiceTakeKeyFor(projectId, script, voiceChoiceOf(project.voice_choice));
    for (const ext of ["mp3", "json"]) {
      const src = `${from}/voice-take-${key}.${ext}`;
      if (fs.existsSync(src)) fs.copyFileSync(src, `${to}/voice-take-${key}.${ext}`);
    }
    const take = loadVoiceTake(newId, key);
    if (take) {
      updates.voice_json = take.voice ? JSON.stringify(take.voice) : null;
      updates.audio_url = `/projects/${newId}/audio`;
      if (frames) updates.current_step = "voice";
      if (Number(project.captions_off) !== 1 && take.captions) {
        updates.captions_json = JSON.stringify(take.captions);
        if (frames) updates.current_step = "captions";
      }
    }
  }
  if (Object.keys(updates).length) {
    const fields = Object.keys(updates).map((key) => `${key} = @${key}`).join(", ");
    db.prepare(`UPDATE projects SET ${fields} WHERE id = @id`).run({ ...updates, id: newId });
  }
  return serializeProject(getProject(newId, userId));
}

/** The latest saved set of Reel frames painted from exactly this script's frame descriptions, with its files on disk. */
function framesForScript(projectId: string, script: Script) {
  const rows = versionRows(projectId, "visuals");
  for (let i = rows.length - 1; i >= 0; i--) {
    const frames = parse<Visual[]>(rows[i].payload_json);
    if (!Array.isArray(frames) || frames.length !== script.scenes.length) continue;
    const matches = script.scenes.every((scene) => {
      const frame = frames.find((item) => item.sceneId === scene.id);
      return Boolean(frame) && (frame!.prompt || "").trim() === (scene.visualPrompt || "").trim();
    });
    if (!matches) continue;
    const filesThere = frames.every((frame) => frame.placeholder || hasStillVersionFile(projectId, frame.sceneId, rows[i].id));
    if (filesThere) return { versionId: rows[i].id, visuals: frames };
  }
  return null;
}

const NO_BRAND_MARK = "Add a logo in Brand Kit first.";

const LOGO_DRAWN_IN = "This logo is part of the picture and can’t be taken off. Make the picture again, or go back to an earlier version.";

/** A finished picture we may change without AI: the one picked in the version list, else the current one. */
async function pictureForLogo(userId: string, projectId: string, sceneId: number, versionId = "") {
  const picked = versionId
    ? (db
        .prepare("SELECT accepted FROM project_step_versions WHERE id = ? AND project_id = ? AND step = 'visuals'")
        .get(versionId, projectId) as { accepted: number } | undefined)
    : undefined;
  if (versionId && !picked) throw Object.assign(new Error("That picture is gone."), { status: 404 });
  if (picked && Number(picked.accepted) !== 1) await restoreStepVersion(userId, projectId, "visuals", versionId, sceneId);
  const project = getProject(projectId, userId);
  if (!isImagePost(String(project.type))) {
    throw Object.assign(new Error("Only pictures can take a logo."), { status: 400 });
  }
  if (project.status === "generating") {
    throw Object.assign(new Error("Wait until the picture is ready."), { status: 409 });
  }
  const visuals = parse<Visual[]>(project.visuals_json) || [];
  const frame = visuals.find((item) => item.sceneId === sceneId);
  if (!frame || frame.placeholder || !hasStillFile(projectId, sceneId)) {
    throw Object.assign(new Error("Make the picture first."), { status: 400 });
  }
  const accepted = db
    .prepare("SELECT id FROM project_step_versions WHERE project_id = ? AND step = 'visuals' AND accepted = 1 ORDER BY created_at DESC LIMIT 1")
    .get(projectId) as { id: string } | undefined;
  if (!accepted) snapshotStills(projectId, saveStepVersion(projectId, "visuals", visuals, ""), visuals);
  else if (!hasStillVersionFile(projectId, sceneId, accepted.id)) snapshotStills(projectId, accepted.id, [frame]);
  return { visuals, frame };
}

function savePictureVersion(userId: string, projectId: string, visuals: Visual[]) {
  const versionId = saveStepVersion(projectId, "visuals", visuals, "");
  snapshotStills(projectId, versionId, visuals);
  db.prepare("UPDATE projects SET visuals_json = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(visuals), projectId);
  return serializeProject(getProject(projectId, userId));
}

/** Puts the Brand Kit logo on a picture that is already made, or moves ours to another corner. No AI, no credits; a new version. */
export async function stampLogoOnPicture(
  userId: string,
  projectId: string,
  sceneId = 1,
  position = "",
  versionId = "",
  rawBox?: unknown
) {
  const { visuals } = await pictureForLogo(userId, projectId, sceneId, versionId);
  const brand = brandFor(userId);
  if (!brand) throw Object.assign(new Error(NO_BRAND_MARK), { status: 400 });
  const box = rawBox === undefined || rawBox === null ? undefined : readLogoBox(rawBox);
  const corner = box ? cornerOf(box) : logoPositionOf({ ...brand, logo_position: position || brand.logo_position });
  const still = stillFile(projectId, sceneId);
  const before = fs.readFileSync(still);
  // Always start from the model's picture, so logos never pile up.
  const base = currentModelPicture(projectId, sceneId);
  if (base.file) fs.copyFileSync(base.file, still);
  const clean = keepCleanStill(projectId, sceneId);
  if (!(await stampBrandMark(still, brand, corner, box))) {
    fs.writeFileSync(still, before);
    throw Object.assign(new Error(NO_BRAND_MARK), { status: 400 });
  }
  return savePictureVersion(
    userId,
    projectId,
    visuals.map((item) => {
      if (item.sceneId !== sceneId) return item;
      const { logoBox: _old, ...rest } = item;
      return { ...rest, clean, logoCorner: corner, ...(box ? { logoBox: box } : {}) };
    })
  );
}

const BAD_LOGO_BOX = "Put the logo inside the picture.";

/** A hand-placed box from the Studio, checked: inside the picture and a sensible size. */
function readLogoBox(raw: unknown): LogoBox {
  const box = raw as Partial<LogoBox> | null;
  const x = Number(box?.x);
  const y = Number(box?.y);
  const w = Number(box?.w);
  if (![x, y, w].every(Number.isFinite) || w < 0.03 || w > 0.8 || x < 0 || y < 0 || x + w > 1.001 || y > 0.99) {
    throw Object.assign(new Error(BAD_LOGO_BOX), { status: 400 });
  }
  return { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000, w: Math.round(w * 10000) / 10000 };
}

/** The corner a hand-placed logo is nearest to — what AI edits keep clear when they cannot use the exact box. */
function cornerOf(box: LogoBox): LogoPosition {
  return `${box.y < 0.5 ? "top" : "bottom"}-${box.x + box.w / 2 < 0.5 ? "left" : "right"}` as LogoPosition;
}

/** Everything the Studio needs to place the logo by hand: the picture without our logo, the mark, and where it sits now. */
export function logoLayout(userId: string, projectId: string, sceneId = 1) {
  const project = getProject(projectId, userId);
  if (!isImagePost(String(project.type))) throw Object.assign(new Error("Only pictures can take a logo."), { status: 400 });
  const brand = brandFor(userId);
  const frame = (parse<Visual[]>(project.visuals_json) || []).find((item) => item.sceneId === sceneId);
  if (!frame || frame.placeholder || !hasStillFile(projectId, sceneId)) {
    throw Object.assign(new Error("Make the picture first."), { status: 400 });
  }
  if (!brand || !brandMarkPath(brand)) throw Object.assign(new Error(NO_BRAND_MARK), { status: 400 });
  const corner = frame.clean && frame.logoCorner ? frame.logoCorner : logoPositionOf(brand);
  const start = brandMarkBox(brand, stillFile(projectId, sceneId), corner);
  if (!start) throw Object.assign(new Error(NO_BRAND_MARK), { status: 400 });
  return { ...start, box: frame.clean && frame.logoBox ? frame.logoBox : start.box };
}

/** The exact mark we stamp (logo, or the business name in their font), shown while placing it by hand. */
export function logoMarkFile(userId: string) {
  const brand = brandFor(userId);
  return brand ? brandMarkPath(brand) : "";
}

/** The picture as the model returned it — the canvas for placing the logo by hand. */
export function logoBaseFile(userId: string, projectId: string, sceneId = 1) {
  getProject(projectId, userId);
  const base = currentModelPicture(projectId, sceneId);
  return base.file || (hasStillFile(projectId, sceneId) ? stillFile(projectId, sceneId) : "");
}

/**
 * For an AI edit of a picture that carries our logo: the model gets the picture without it, and we put it back after
 * in the same corner. So the model never redraws the logo, and it can always come off for free.
 */
function logoToKeep(projectId: string, sceneId: number, versionId: string) {
  const rows = versionRows(projectId, "visuals");
  const index = versionId ? rows.findIndex((row) => row.id === versionId) : rows.findIndex((row) => Number(row.accepted) === 1);
  if (index < 0 || !hasOurLogo(projectId, rows, index)) return null;
  const frame = (parse<Visual[]>(rows[index].payload_json) || []).find((item) => item.sceneId === sceneId);
  const base = modelPictureFor(projectId, rows, index, sceneId);
  if (!base.file) return null;
  return { file: base.file, corner: logoPositionOf({ logo_position: frame?.logoCorner } as BrandKit), box: frame?.logoBox };
}

async function putLogoBack(userId: string, projectId: string, visuals: Visual[], sceneId: number, corner: LogoPosition, box?: LogoBox) {
  const brand = brandFor(userId);
  if (!brand || !hasStillFile(projectId, sceneId)) return visuals;
  const clean = keepCleanStill(projectId, sceneId);
  if (!(await stampBrandMark(stillFile(projectId, sceneId), brand, corner, box))) return visuals;
  return visuals.map((item) => {
    if (item.sceneId !== sceneId) return item;
    const { logoBox: _old, ...rest } = item;
    return { ...rest, clean, logoCorner: corner, ...(box ? { logoBox: box } : {}) };
  });
}

/** Takes every logo we stamped off: back to the picture the model returned. A logo the model painted itself stays. */
export async function removeLogoFromPicture(userId: string, projectId: string, sceneId = 1, versionId = "") {
  const { visuals, frame } = await pictureForLogo(userId, projectId, sceneId, versionId);
  const still = stillFile(projectId, sceneId);
  const base = currentModelPicture(projectId, sceneId);
  if (!base.file || (!frame.clean && sameFile(base.file, still))) {
    throw Object.assign(new Error(LOGO_DRAWN_IN), { status: 400 });
  }
  fs.copyFileSync(base.file, still);
  return savePictureVersion(
    userId,
    projectId,
    visuals.map((item) => {
      if (item.sceneId !== sceneId) return item;
      const { clean: _clean, logoCorner: _corner, logoBox: _box, ...rest } = item;
      return rest;
    })
  );
}

const CURRENT_PICTURE = "This is the current picture. Pick another one first.";

/**
 * Before a model picture goes, the logo versions made from it keep what they need: one equal to it takes its place,
 * the others get their own clean copy, so "remove logo" still returns the right picture.
 */
function keepLogoLineage(projectId: string, rows: VersionRow[], index: number) {
  const model = rows[index];
  for (let i = index + 1; i < rows.length && !rows[i].generation_id; i++) {
    const frames = parse<Visual[]>(rows[i].payload_json) || [];
    let changed = false;
    let promote = false;
    const next = frames.map((frame) => {
      if (frame.placeholder || frame.clean) return frame;
      const base = modelPictureFor(projectId, rows, i, frame.sceneId);
      const own = stillVersionFile(projectId, frame.sceneId, rows[i].id);
      if (!base.file || !fs.existsSync(own)) return frame;
      if (sameFile(base.file, own)) {
        promote = true;
        return frame;
      }
      changed = true;
      return { ...frame, clean: keepCleanCopy(projectId, base.file) };
    });
    if (promote) db.prepare("UPDATE project_step_versions SET generation_id = ? WHERE id = ?").run(model.generation_id, rows[i].id);
    if (changed) {
      const json = JSON.stringify(next);
      db.prepare("UPDATE project_step_versions SET payload_json = ? WHERE id = ?").run(json, rows[i].id);
      if (Number(rows[i].accepted) === 1) db.prepare("UPDATE projects SET visuals_json = ? WHERE id = ?").run(json, projectId);
    }
  }
}

function removeVersionFiles(projectId: string, row: VersionRow) {
  for (const frame of parse<Visual[]>(row.payload_json) || []) {
    fs.rmSync(stillVersionFile(projectId, frame.sceneId, row.id), { force: true });
    if (!frame.clean) continue;
    const used = db
      .prepare(
        "SELECT 1 FROM project_step_versions WHERE project_id = ? AND id != ? AND payload_json LIKE ? UNION SELECT 1 FROM projects WHERE id = ? AND visuals_json LIKE ?"
      )
      .get(projectId, row.id, `%${frame.clean}%`, projectId, `%${frame.clean}%`);
    if (!used) fs.rmSync(cleanStillFile(projectId, frame.clean), { force: true });
  }
}

function deleteOnePictureVersion(projectId: string, versionId: string) {
  const rows = versionRows(projectId, "visuals");
  const index = rows.findIndex((row) => row.id === versionId);
  if (index < 0) throw Object.assign(new Error("That picture is gone."), { status: 404 });
  if (Number(rows[index].accepted) === 1) throw Object.assign(new Error(CURRENT_PICTURE), { status: 400 });
  if (rows[index].generation_id) keepLogoLineage(projectId, rows, index);
  db.prepare("DELETE FROM project_step_versions WHERE id = ?").run(versionId);
  removeVersionFiles(projectId, rows[index]);
}

function pictureProject(userId: string, projectId: string) {
  const project = getProject(projectId, userId);
  if (!isImagePost(String(project.type))) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  if (project.status === "generating") throw Object.assign(new Error("Wait until the picture is ready."), { status: 409 });
  return project;
}

/** Drops one picture from the version list. The current picture stays. */
export function deletePictureVersion(userId: string, projectId: string, versionId: string) {
  pictureProject(userId, projectId);
  deleteOnePictureVersion(projectId, versionId);
  db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
  return serializeProject(getProject(projectId, userId));
}

/** Keeps only the current picture in the version list. */
export function keepOnlyCurrentPicture(userId: string, projectId: string) {
  pictureProject(userId, projectId);
  for (const row of versionRows(projectId, "visuals")) {
    if (Number(row.accepted) !== 1) deleteOnePictureVersion(projectId, row.id);
  }
  db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
  return serializeProject(getProject(projectId, userId));
}

function currentModelPicture(projectId: string, sceneId: number) {
  const rows = versionRows(projectId, "visuals");
  const index = rows.findIndex((row) => Number(row.accepted) === 1);
  return modelPictureFor(projectId, rows, index < 0 ? rows.length - 1 : index, sceneId);
}

function pickIdea(data: Idea & { invite?: unknown }): Idea {
  return (
    tidyIdea({ ...data, shotConfirmed: false }) || {
      title: "",
      hook: "",
      concept: "",
      audience: "",
      visualDirection: "",
      shot: emptyShot(),
      shotConfirmed: false,
    }
  );
}

/** Owner approves the planned shot, or rewrites its fields by hand first. No AI call, no credits. */
export function updateShot(userId: string, projectId: string, body: { confirm?: unknown; shot?: unknown }) {
  const project = getProject(projectId, userId);
  const type = String(project.type);
  if (!isImagePost(type)) {
    throw Object.assign(new Error("Only still pictures have a shot to confirm."), { status: 400 });
  }
  const idea = tidyIdea(parse(project.idea_json));
  if (!idea) throw Object.assign(new Error("Generate the idea first."), { status: 400 });
  let next: Idea = idea;
  if (body.shot && typeof body.shot === "object") {
    const raw = body.shot as Record<string, unknown>;
    const field = (key: keyof Shot, max: number) => String(raw[key] ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const typed: Shot = {
      subject: field("subject", 240),
      place: field("place", 160),
      angle: field("angle", 160),
      people: field("people", 160),
      mood: field("mood", 160),
      words: field("words", 200),
      summary: field("summary", 280),
    };
    if (!typed.subject && !typed.summary) {
      throw Object.assign(new Error("Describe the shot — at least what is in the frame."), { status: 400 });
    }
    const summary = typed.summary || [typed.subject, typed.place].filter(Boolean).join(", ");
    next = { ...next, shot: { ...typed, summary }, visualDirection: summary, shotConfirmed: false };
  }
  if (body.confirm === true) next = { ...next, shotConfirmed: true };
  db.prepare("UPDATE projects SET idea_json = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(next), projectId);
  db.prepare(
    "UPDATE project_step_versions SET payload_json = ? WHERE project_id = ? AND step = 'idea' AND accepted = 1"
  ).run(JSON.stringify(next), projectId);
  return serializeProject(getProject(projectId, userId));
}

export async function updateInvite(userId: string, projectId: string, raw: unknown) {
  const project = getProject(projectId, userId);
  const type = String(project.type);
  const imageIntent = parseImageIntent(type, project.image_intent);
  if (!isInvitePoster(type, imageIntent)) {
    throw Object.assign(new Error("This post is not an invitation."), { status: 400 });
  }
  const invite = preferBriefInvite(
    inviteFrom(raw, String(project.prompt), project.invite_json, imageIntent),
    String(project.prompt),
    imageIntent
  );
  db.prepare("UPDATE projects SET invite_json = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(invite), projectId);
  return serializeProject(getProject(projectId, userId));
}

export function saveFeedback(userId: string, projectId: string, publishable: string, reasons: string[]) {
  getProject(projectId, userId);
  if (!["yes", "edits", "no"].includes(publishable)) {
    throw Object.assign(new Error("Tell us if you would publish this Reel."), { status: 400 });
  }
  db.prepare(
    `INSERT INTO project_feedback (id, project_id, user_id, publishable, reasons_json) VALUES (?, ?, ?, ?, ?)`
  ).run(uuid(), projectId, userId, publishable, JSON.stringify(reasons));
  return serializeProject(getProject(projectId, userId));
}

export function createProject(
  userId: string,
  type: FormatType,
  prompt: string,
  imageIntent: ImageIntent | "" = "",
  useBrand = true,
  pictureLanguage: PictureLanguage = "",
  imageFormat = ""
) {
  const id = uuid();
  const language = isTextPoster(type, imageIntent) ? parsePictureLanguage(pictureLanguage) : "";
  db.prepare(
    `INSERT INTO projects (id, user_id, type, prompt, image_intent, use_brand, picture_language, image_format, status, current_step)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'prompt')`
  ).run(id, userId, type, prompt, imageIntent, useBrand ? 1 : 0, language, type === "image_post" ? imageFormat : "");
  return getProject(id, userId);
}

export async function runStep(
  userId: string,
  projectId: string,
  step: keyof typeof CREDIT_COSTS,
  opts: {
    regenerate?: boolean;
    sceneId?: number;
    idempotencyKey?: string;
    feedbackReason?: unknown;
    feedbackNote?: unknown;
    evictOldest?: boolean;
    pictureLanguage?: unknown;
    keepStill?: boolean;
    keepStillVersionId?: unknown;
    copyEdit?: unknown;
    copyEditImage?: unknown;
    reformat?: unknown;
    uiLanguage?: unknown;
  } = {}
) {
  const project = getProject(projectId, userId);
  if (needsVerification(userId)) throw emailUnverifiedError();
  const brand = Number(project.use_brand) === 0 ? null : brandFor(userId);
  const sceneId = Number.isFinite(opts.sceneId) ? Number(opts.sceneId) : undefined;
  if (sceneId && step !== "visuals") {
    throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  }
  const prompt = String(project.prompt);
  const type = String(project.type);
  const imageIntent = parseImageIntent(type, project.image_intent);
  const keepStill = Boolean(opts.keepStill);
  const keepStillVersionId = String(opts.keepStillVersionId || "").trim().slice(0, 80);
  const copyEdit = String(opts.copyEdit || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
  const requestedLang = parsePictureLanguage(opts.pictureLanguage);
  const reformat = keepStill ? parseImageFormat(opts.reformat) : "";
  // A new try follows the picture chosen now: bringing back a Ukrainian version after an English one means Ukrainian.
  const pictureLanguage =
    requestedLang ||
    ((isTextPoster(type, String(project.image_intent || "")) ? chosenPictureLanguage(projectId) : null) ??
      parsePictureLanguage(project.picture_language));
  const regenerate = Boolean(opts.regenerate) || keepStill;
  let keepStillPath = "";
  let keepLogo: { file: string; corner: LogoPosition; box?: LogoBox } | null = null;
  let editExample: BrandImageFile | undefined;
  let logoSpot: LogoSpot | undefined;
  let logoHold: LogoSpot | undefined;

  const alreadyDone =
    (step === "idea" && Boolean(project.idea_json)) ||
    (step === "script" && Boolean(project.script_json)) ||
    (step === "visuals" && Boolean(project.visuals_json)) ||
    (step === "voice" && hasVoiceFile(projectId)) ||
    (step === "captions" && Boolean(project.captions_json)) ||
    (step === "render" && hasVideoFile(projectId));
  if (isImagePost(type) && (step === "script" || step === "voice" || step === "captions" || step === "render")) {
    throw Object.assign(new Error("This is a still post — pictures only, no voice or video."), { status: 400 });
  }
  if (alreadyDone && !regenerate) return serializeProject(project);
  const feedback = regenerate ? parseStepFeedback(step, opts.feedbackReason, opts.feedbackNote) : { reason: "", note: "" };

  const idempotencyKey = String(opts.idempotencyKey || "").trim().slice(0, 80);
  if (idempotencyKey) {
    const prior = db
      .prepare(
        `SELECT status, project_id FROM ai_generations WHERE user_id = ? AND idempotency_key = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(userId, idempotencyKey) as { status: string; project_id: string } | undefined;
    if (prior?.status === "succeeded") return serializeProject(getProject(projectId, userId));
    if (prior?.status === "running") {
      throw Object.assign(new Error("We’re already making this. Wait a moment."), { status: 409 });
    }
  }
  failStaleRuns(projectId, step);
  const inflight = db
    .prepare(`SELECT id FROM ai_generations WHERE project_id = ? AND type = ? AND status = 'running'`)
    .get(projectId, step);
  if (inflight) {
    throw Object.assign(new Error("We’re already making this. Wait for it to finish."), { status: 409 });
  }

  // One frame counts its own tries, so redoing frame 3 does not make frame 1 dearer.
  const attemptsSoFar = step === "visuals" && sceneId ? frameAttemptCount(projectId, sceneId) : stepAttemptCount(projectId, step);
  const multiplier = attemptsSoFar >= MAX_STEP_ATTEMPTS ? EXTRA_ATTEMPT_MULTIPLIER : 1;
  const visualsBase =
    step === "visuals" && sceneId
      ? VISUAL_SCENE_CREDITS
      : step === "visuals" && isImagePost(type)
        ? IMAGE_SLIDE_COUNT * VISUAL_SCENE_CREDITS
        : CREDIT_COSTS[step];
  let cost = attemptCost(visualsBase, attemptsSoFar);

  const idea = parse<Idea>(project.idea_json);
  const script = parse<Script>(project.script_json);
  if (step === "script" && !idea) {
    throw Object.assign(new Error("Generate the idea first."), { status: 400 });
  }
  if (step === "visuals" && isImagePost(type) && !idea) {
    throw Object.assign(new Error("Generate the idea first."), { status: 400 });
  }
  if (step === "visuals" && isImagePost(type) && !project.visuals_json && !tidyIdea(idea)?.shotConfirmed) {
    throw Object.assign(new Error("Check the shot first — say yes, or fix it."), {
      status: 400,
      code: "shot_unconfirmed",
    });
  }
  if (step === "visuals" && !config.openaiKey) {
    console.error("Pictures blocked: OPENAI_API_KEY is not set on the server.");
    throw Object.assign(new Error(USER_ERRORS.pictureUnavailable), { status: 503 });
  }
  if (keepStill) {
    if (step !== "visuals" || !isImagePost(type)) {
      throw Object.assign(new Error("Text changes are only for still pictures."), { status: 400 });
    }
    if ([requestedLang, copyEdit, reformat].filter(Boolean).length > 1) {
      throw Object.assign(new Error("Choose one change at a time: language, words or shape."), { status: 400 });
    }
    if (reformat && reformat === parseImageFormat(project.image_format)) {
      throw Object.assign(new Error("The picture already has this shape."), { status: 400 });
    }
    if (requestedLang && !isTextPoster(type, imageIntent)) {
      throw Object.assign(new Error("Same-picture language is only for invitations, information and offers."), {
        status: 400,
      });
    }
    if (!requestedLang && !copyEdit && !reformat) {
      throw Object.assign(new Error("Say what to add or remove on the picture, or choose English or Ukrainian."), {
        status: 400,
      });
    }
    if (copyEdit && copyEdit.length < 4) {
      throw Object.assign(new Error("Say what to add or remove on the picture — a few words is enough."), {
        status: 400,
      });
    }
    if (copyEdit && opts.copyEditImage) {
      const upload = readExampleUpload(opts.copyEditImage);
      if ("error" in upload) throw Object.assign(new Error(upload.error), { status: 400 });
      editExample = writeEditExample(projectId, upload.buffer, upload.kind);
    }
    const keepScene = sceneId || 1;
    let useLiveIfMissing = !keepStillVersionId;
    if (keepStillVersionId) {
      const chosen = db
        .prepare(
          `SELECT id, accepted FROM project_step_versions WHERE id = ? AND project_id = ? AND step = 'visuals'`
        )
        .get(keepStillVersionId, projectId) as { id: string; accepted: number } | undefined;
      if (!chosen) {
        throw Object.assign(new Error("That picture is gone."), { status: 404 });
      }
      const hasChosenFile = hasStillVersionFile(projectId, keepScene, keepStillVersionId);
      useLiveIfMissing = Number(chosen.accepted) === 1 && !hasChosenFile;
      if (!hasChosenFile && !useLiveIfMissing) {
        throw Object.assign(new Error("That picture is gone."), { status: 404 });
      }
    }
    keepStillPath = copySelectedStill(projectId, keepScene, keepStillVersionId || undefined, useLiveIfMissing);
    if (!keepStillPath) {
      throw Object.assign(new Error("Make the picture first."), { status: 400 });
    }
    keepLogo = logoToKeep(projectId, keepScene, keepStillVersionId);
    if (keepLogo) fs.copyFileSync(keepLogo.file, keepStillPath);
    // "Make room for the logo": tell the model the exact box our stamp will take, then stamp it there ourselves.
    const spotAsk = copyEdit ? logoSpotRequest(copyEdit) : null;
    const kit = spotAsk ? brandFor(userId) : null;
    const box = spotAsk && kit ? brandMarkSpot(kit, keepStillPath) : null;
    if (spotAsk && kit && box) {
      // A move keeps the half of the corner they did not name from where the logo is now, else from the kit.
      const [vertical, horizontal] = (keepLogo?.corner || logoPositionOf(kit)).split("-");
      const look = logoLook(userId);
      logoSpot = {
        corner: `${spotAsk.vertical || vertical}-${spotAsk.horizontal || horizontal}` as LogoPosition,
        ...box,
        shape: look?.shape,
        colors: look?.colors,
      };
    } else if (keepLogo) {
      const owner = brandFor(userId);
      const held = owner ? brandMarkSpot(owner, keepStillPath) : null;
      const sizes = owner && keepLogo.box ? brandMarkBox(owner, keepStillPath, keepLogo.corner) : null;
      if (held && keepLogo.box && sizes) {
        // Placed by hand: tell the model that exact box, measured from its nearest corner.
        const { x, y, w } = keepLogo.box;
        const h = (w * sizes.pictureRatio) / sizes.markRatio;
        logoHold = {
          ...held,
          corner: keepLogo.corner,
          w: Math.round(w * 100),
          h: Math.round(h * 100),
          x: Math.round((keepLogo.corner.endsWith("left") ? x : 1 - x - w) * 100),
          y: Math.round((keepLogo.corner.startsWith("top") ? y : 1 - y - h) * 100),
        };
      } else if (held) logoHold = { corner: keepLogo.corner, ...held };
    }
  }
  if ((step === "visuals" || step === "voice" || step === "captions" || step === "render") && !script && !isImagePost(type)) {
    throw Object.assign(new Error("Generate the script first."), { status: 400 });
  }
  const imageScript =
    isImagePost(type) && idea
      ? imageCarousel(
          prompt,
          idea,
          imageIntent,
          feedback,
          brand,
          pictureLanguage,
          imageIntent === "invite" && project.invite_json ? parseInvite(parse(project.invite_json)) : null
        )
      : script;
  if (step === "visuals" && sceneId && imageScript && !imageScript.scenes.find((item) => item.id === sceneId)) {
    throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  }
  const voiceOff = Number(project.voice_off) === 1;
  const captionsOff = Number(project.captions_off) === 1;
  if (step === "render" && !captionsOff && !project.captions_json) {
    throw Object.assign(new Error("Make the captions first, or choose No captions."), { status: 400 });
  }
  if (step === "render" && !voiceOff && !hasVoiceFile(projectId)) {
    throw Object.assign(new Error("Record the voice first, or choose No voice."), { status: 400 });
  }
  // No voice: captions are the on-screen words of each scene, made here — no AI, no credits.
  if (step === "captions" && voiceOff) cost = 0;
  // The video is paid once per Reel; making it again (ffmpeg only) is free.
  if (step === "render" && (renderPaidBefore(projectId) || hasVideoFile(projectId))) cost = 0;
  if (step === "render") {
    assertArchiveRoom(userId, projectId, Boolean(opts.evictOldest));
  }

  if (getBalance(userId) < cost) {
    const err = new Error("Not enough credits. Buy a pack or upgrade your plan.") as Error & { status: number };
    err.status = 402;
    throw err;
  }

  const logged = logGeneration({
    userId,
    projectId,
    type: step,
    provider: "pending",
    model: "pending",
    cost: 0,
    credits: cost,
    status: "running",
    idempotencyKey: idempotencyKey || undefined,
  });
  const generationId = logged.id;
  const reserved = cost;
  try {
    if (reserved > 0) spendCredits(userId, reserved, `${regenerate ? "regenerate " : ""}${step} for ${type}`, generationId);
  } catch (error) {
    finishGeneration(generationId, logged.started, {
      provider: "pending",
      model: "pending",
      actualCost: 0,
      credits: 0,
      status: "failed",
    });
    throw error;
  }
  if (alreadyDone && regenerate) {
    recordStepRejection({
      projectId,
      step,
      sceneId,
      reason: feedback.reason,
      note: feedback.note,
    });
  }
  db.prepare("UPDATE projects SET status = 'generating', updated_at = datetime('now') WHERE id = ?").run(projectId);
  let providerTouched = false;
  const meta: Record<string, unknown> = { startedAt: logged.started };

  try {
    let provider = "auteur-studio";
    let model = "preview";
    let actualCost = 0;
    const updates: Record<string, string | number> = {
      updated_at: new Date().toISOString(),
    };

    if (step === "idea") {
      providerTouched = true;
      const result = await generateIdea(prompt, type, brand, imageIntent, feedback, opts.uiLanguage === "uk" ? "uk" : opts.uiLanguage === "en" ? "en" : "");
      const picked = pickIdea(result.data);
      updates.idea_json = JSON.stringify(
        isImagePost(type) ? { ...picked, shot: keepWordsHonest(picked.shot, [prompt], imageIntent) } : picked
      );
      if (isInvitePoster(type, imageIntent)) {
        updates.invite_json = JSON.stringify(preferBriefInvite(result.data.invite, prompt, "invite"));
      }
      updates.current_step = "idea";
      provider = result.provider;
      model = result.model;
      actualCost = result.cost;
    } else if (step === "script" && idea) {
      providerTouched = true;
      const result = await generateScript(prompt, idea, brand, feedback);
      updates.script_json = JSON.stringify(result.data);
      updates.current_step = "script";
      provider = result.provider;
      model = result.model;
      actualCost = result.cost;
    } else if (step === "visuals" && imageScript) {
      providerTouched = true;
      const poster = isImagePost(type) && isTextPoster(type, imageIntent || "photo");
      const kind = poster ? "poster" : isImagePost(type) ? "still" : "video";
      // A Reel's logo is one layer over the finished video, never painted into the frames.
      // A gift certificate gets its logo and contacts on the printed page itself, with the exact words.
      const isCertificate = imageIntent === "certificate";
      const skipLogoStamp = keepStill || kind === "video" || isCertificate;
      // The contact line goes on photo posts only: flyers already carry their own text, Reels have captions.
      const stampContact = kind === "still" && !keepStill && !isCertificate;
      let paintedCopy = "";
      let translatedBrief = "";
      if (keepStill && requestedLang) {
        const fromStill = await readPaintedCopy(keepStillPath);
        translatedBrief = await translateBrief(prompt, requestedLang, brand?.business_name || "");
        paintedCopy = (await translatePictureCopy(fromStill, requestedLang, prompt, brand?.business_name || "")) || translatedBrief;
      }
      const frameOpts = {
        keepStill,
        pictureLanguage: (keepStill ? requestedLang : pictureLanguage) || undefined,
        keepStillPath: keepStillPath || undefined,
        brief: translatedBrief || prompt,
        paintedCopy: paintedCopy || undefined,
        copyEdit: keepStill && copyEdit ? copyEdit : undefined,
        editExample,
        logoSpot,
        logoHold,
        reformat: reformat || undefined,
        exampleRefs: keepStill ? [] : listExampleRefs(projectId),
        reelLogo: kind === "video" ? reelLogoSpotFor(project, brand) : undefined,
        format: (reformat ||
          (isImagePost(type) ? resolveImageFormat(kind === "poster" ? "poster" : "still", project.image_format) : undefined)) as
          | ImageFormat
          | undefined,
      };
      if (keepStill && imageScript && reformat) {
        const rewrite = rewriteStillFormatPrompt(reformat);
        for (const scene of imageScript.scenes) scene.visualPrompt = rewrite;
      } else if (keepStill && imageScript && copyEdit) {
        const rewrite = rewriteStillCopyPrompt(copyEdit);
        for (const scene of imageScript.scenes) scene.visualPrompt = rewrite;
      } else if (keepStill && imageScript && requestedLang) {
        const rewrite = rewriteStillLanguagePrompt(translatedBrief || prompt, requestedLang, paintedCopy, brand?.business_name || "");
        for (const scene of imageScript.scenes) scene.visualPrompt = rewrite;
      }
      if (requestedLang && isTextPoster(type, imageIntent)) {
        updates.picture_language = requestedLang;
      }
      const avoid = regenInstruction(feedback);
      if (avoid) {
        for (const scene of imageScript.scenes) {
          if (!scene.visualPrompt.includes(avoid)) scene.visualPrompt = `${scene.visualPrompt} ${avoid}`;
        }
      }
      if (isImagePost(type)) {
        updates.script_json = JSON.stringify(imageScript);
      }
      if (regenerate || sceneId) {
        const currentFrames = parse<Visual[]>(project.visuals_json) || [];
        const currentVersion = db
          .prepare(
            `SELECT id FROM project_step_versions
             WHERE project_id = ? AND step = 'visuals' AND accepted = 1
             ORDER BY created_at DESC LIMIT 1`
          )
          .get(projectId) as { id: string } | undefined;
        if (currentVersion && currentFrames.length) snapshotStills(projectId, currentVersion.id, currentFrames);
      }
      if (sceneId) {
        const scene = imageScript.scenes.find((item) => item.id === sceneId)!;
        const current = parse<Visual[]>(project.visuals_json) || [];
        const one = await generateOneVisual(scene, brand, kind, frameOpts);
        let next = await persistStills(
          projectId,
          current.some((item) => item.sceneId === sceneId)
            ? current.map((item) => (item.sceneId === sceneId ? one.data : item))
            : [...current, one.data],
          brand,
          skipLogoStamp,
          stampContact,
          frameOpts.format
        );
        const logoBack = logoSpot?.corner || keepLogo?.corner;
        // A logo placed by hand goes back to its exact box — unless this edit moved it.
        const logoBackBox = logoSpot ? undefined : keepLogo?.box;
        if (logoBack && !one.data.placeholder) next = await putLogoBack(userId, projectId, next, sceneId, logoBack, logoBackBox);
        if (reformat && !one.data.placeholder) updates.image_format = reformat;
        updates.visuals_json = JSON.stringify(next);
        updates.current_step = "visuals";
        provider = one.provider;
        model = one.model;
        actualCost = one.cost;
      } else {
        const result = await generateVisuals(imageScript, brand, kind, async (visual) => {
          const [saved] = await persistStills(projectId, [visual], brand, true, false, frameOpts.format);
          return saved;
        }, frameOpts);
        const minLive = visualMinLive(imageScript.scenes.length);
        if (result.usedOpenAI && result.live < minLive) {
          throw Object.assign(
            new Error(isImagePost(type) ? USER_ERRORS.pictureFailed : USER_ERRORS.framesFailed),
            { status: 400 }
          );
        }
        const persisted = await persistStills(projectId, result.data, brand, skipLogoStamp, stampContact, frameOpts.format);
        updates.visuals_json = JSON.stringify(persisted);
        updates.current_step = "visuals";
        provider = result.provider;
        model = result.model;
        actualCost = result.cost;
        if (result.usedOpenAI) cost = result.live * VISUAL_SCENE_CREDITS * multiplier;
      }
    } else if (step === "voice" && script) {
      providerTouched = true;
      const result = await generateVoice(script, brand);
      const voiceChoice = voiceChoiceOf(project.voice_choice);
      // The voice reads exactly the script's words (what the owner sees and edits), in the voice they chose.
      const spokenWords = script.scenes.map((scene) => scene.voiceover).join(" ").replace(/\s+/g, " ").trim();
      const direction = {
        voicePreset: voiceChoice,
        voice: voiceChoice,
        voiceId: voiceChoice,
        script: spokenWords || result.data.script,
        notes: result.data.notes,
      };
      updates.voice_json = JSON.stringify(direction);
      updates.voice_off = 0;
      const tts = await synthesizeSpeech(direction.script, projectId, {
        voice: voiceChoice,
        instructions: voiceInstructions(direction.script, brand?.tone_of_voice || "", String(direction.notes || "")),
      });
      saveVoiceTake(projectId, voiceTakeKey(script, voiceChoice), direction);
      updates.audio_url = `/projects/${projectId}/audio`;
      updates.current_step = "voice";
      provider = tts.provider;
      model = tts.model;
      actualCost = result.cost + tts.cost;
      logGeneration({
        userId,
        projectId,
        type: "tts",
        provider: tts.provider,
        model: tts.model,
        cost: tts.cost,
        credits: 0,
        status: "succeeded",
      });
    } else if (step === "captions" && script && voiceOff) {
      updates.captions_off = 0;
      updates.captions_json = JSON.stringify({ cues: sceneCaptions(script) });
      updates.current_step = "captions";
      provider = "auteur";
      model = "on-screen-words";
    } else if (step === "captions" && script) {
      providerTouched = true;
      const audioSec = (await voiceDurationSec(projectId)) || script.durationSec || 30;
      const spokenText = script.scenes.map((scene) => scene.voiceover).join(" ");
      const ukrainian = (spokenText.match(/[\u0400-\u04FF]/g) || []).length > (spokenText.match(/[A-Za-z]/g) || []).length;
      const heard = await voiceWordTimes(projectId, ukrainian ? "uk" : "en");
      const timed = heard ? captionsFromWordTimes(script.scenes, heard.words, heard.duration || audioSec) : [];
      const result = timed.length
        ? { data: { cues: timed }, provider: "openai", model: "whisper-1", cost: 0.006 * Math.max(0.25, audioSec / 60) }
        : await generateCaptions(script, audioSec);
      updates.captions_off = 0;
      updates.captions_json = JSON.stringify(result.data);
      saveTakeCaptions(projectId, voiceTakeKeyFor(projectId, script, voiceChoiceOf(project.voice_choice)), result.data);
      updates.current_step = "captions";
      provider = result.provider;
      model = result.model;
      actualCost = result.cost;
    } else if (step === "render" && script) {
      // ffmpeg only, no AI: a failed render gives the credits back.
      const layers = await reelLayers(projectId, project, brand, script);
      if (layers.framesChanged) updates.visuals_json = JSON.stringify(layers.visuals);
      const rendered = await renderReel({
        projectId,
        script,
        visuals: layers.visuals,
        captions: captionsOff ? null : parse<{ cues: CaptionCue[] }>(project.captions_json),
        primaryColor: brand?.primary_color,
        silent: voiceOff,
        music: hasMusicFile(projectId) ? reelMusicOf(project) : null,
        logo: layers.logo,
        endCard: layers.endCard,
        captionStyle: captionStyleOf(project),
      titles: reelTitlesOf(project),
        brand,
      });
      updates.current_step = "create";
      updates.status = "ready";
      updates.output_url = `/projects/${projectId}/file`;
      if (opts.evictOldest) evictOverLimit(userId, projectId);
      provider = rendered.provider;
      model = rendered.model;
      actualCost = rendered.cost;
      meta.queueWaitMs = rendered.queueWaitMs;
      meta.encodeMs = rendered.encodeMs;
    }

    if (cost < reserved) {
      refundCredits(userId, reserved - cost, `Unused ${step} credits after live frames`);
    }

    updates.credits_used = Number(project.credits_used) + cost;

    // A finished Reel whose new frames, captions or (without captions) voice are in: keep the video and make it again
    // with them (ffmpeg only, free). A missed frame leaves a colour card, so then the video is made again as a step.
    const framesNow = step === "visuals" ? parse<Visual[]>(String(updates.visuals_json || "")) || [] : [];
    const framesOk =
      step !== "visuals" ||
      (sceneId ? Boolean(framesNow.find((v) => v.sceneId === sceneId && !v.placeholder)) : framesNow.length > 0 && framesNow.every((v) => !v.placeholder));
    const remakeVideo =
      !isImagePost(type) &&
      hasVideoFile(projectId) &&
      (regenerate || Boolean(sceneId)) &&
      (step === "visuals" || step === "captions" || (step === "voice" && captionsOff)) &&
      framesOk &&
      (voiceOff || step === "voice" || hasVoiceFile(projectId));
    if (remakeVideo) {
      delete updates.current_step;
    } else if (regenerate || sceneId) {
      Object.assign(updates, downstreamWipe(step, Boolean(sceneId)));
      if (step === "idea" || step === "script") {
        keepCurrentVoice(projectId);
        removeVoiceFile(projectId);
      }
      if (step !== "render") removeVideoFile(projectId);
    }
    if (step === "render") {
      /* ready already set */
    } else if (isImagePost(type)) {
      updates.status = step === "visuals" ? "ready" : "draft";
      if (step === "visuals") updates.output_url = `/projects/${projectId}/image/1`;
    } else {
      updates.status = hasVideoFile(projectId) ? "ready" : "draft";
    }

    const fields = Object.keys(updates)
      .map((k) => `${k} = @${k}`)
      .join(", ");
    db.prepare(`UPDATE projects SET ${fields} WHERE id = @id`).run({ ...updates, id: projectId });

    finishGeneration(generationId, logged.started, {
      provider,
      model,
      actualCost,
      credits: cost,
      status: "succeeded",
      meta,
    });
    const versionPayload =
      step === "idea"
        ? updates.idea_json
        : step === "script"
          ? updates.script_json
          : step === "visuals"
            ? updates.visuals_json
            : step === "voice"
              ? updates.voice_json
              : step === "captions"
                ? updates.captions_json
                : updates.output_url;
    const versionId = saveStepVersion(
      projectId,
      step,
      versionPayload ? parse(String(versionPayload)) || versionPayload : {},
      generationId,
      sceneId
    );
    if (step === "visuals") {
      const frames = parse<Visual[]>(String(updates.visuals_json || ""));
      if (frames?.length) snapshotStills(projectId, versionId, frames);
    }
    if (String(updates.status || "") === "ready") maybeRefreshLearnedSummary(userId);
    if (remakeVideo) {
      // The new part is already in; a video that could not catch up is dropped, so it is made again as the step (free).
      await settleVideo(userId, projectId, true, brand);
    }

    return serializeProject(getProject(projectId, userId));
  } catch (error) {
    finishGeneration(generationId, logged.started, {
      provider: "pending",
      model: "pending",
      actualCost: 0,
      credits: 0,
      status: "failed",
      meta: { ...meta, aiCalled: providerTouched },
    });
    // Nothing came out, so nothing is paid — even when the AI was called (that cost is ours).
    if (reserved > 0) refundCredits(userId, reserved, `Refund ${step} — ${providerTouched ? "the AI did not deliver" : "AI was not called"}`);
    db.prepare(
      `UPDATE projects SET status = CASE WHEN status = 'generating' THEN ? ELSE status END, updated_at = datetime('now') WHERE id = ?`
    ).run(settledStatus(projectId), projectId);
    const failed = forOwner(error, `Step ${step} (${projectId})`, stepFailedText(step, type)) as Error & { code?: string };
    if (reserved > 0 && !failed.code) failed.code = "credits_refunded";
    throw failed;
  }
}

/** What a project is once nothing runs: ready when its picture or video is there, a draft otherwise. */
function settledStatus(projectId: string) {
  const row = db.prepare("SELECT type, visuals_json FROM projects WHERE id = ?").get(projectId) as { type: string; visuals_json: string | null } | undefined;
  if (!row) return "draft";
  if (isImagePost(String(row.type))) return row.visuals_json && hasStillFile(projectId, 1) ? "ready" : "draft";
  return hasVideoFile(projectId) ? "ready" : "draft";
}

/**
 * Runs that never finished (the server stopped, or the AI hung): marked failed, their credits given back and the
 * project freed, so nothing stays "generating" and nothing is paid for a result that never came.
 */
export function failStaleRuns(projectId?: string, step?: string, olderThanMs = 10 * 60 * 1000) {
  const since = new Date(Date.now() - olderThanMs).toISOString();
  const rows = db
    .prepare(
      `SELECT id, user_id, project_id, type, credits_used FROM ai_generations
       WHERE status = 'running' AND started_at < ? ${projectId ? "AND project_id = ?" : ""} ${step ? "AND type = ?" : ""}`
    )
    .all(...([since, projectId, step].filter((value) => value !== undefined) as string[])) as {
    id: string;
    user_id: string;
    project_id: string;
    type: string;
    credits_used: number;
  }[];
  for (const run of rows) {
    db.prepare(`UPDATE ai_generations SET status = 'failed', credits_used = 0, finished_at = datetime('now') WHERE id = ?`).run(run.id);
    if (Number(run.credits_used) > 0) refundCredits(run.user_id, Number(run.credits_used), `Refund ${run.type} — the run never finished`);
    if (run.project_id) {
      db.prepare(`UPDATE projects SET status = CASE WHEN status = 'generating' THEN ? ELSE status END WHERE id = ?`).run(
        settledStatus(run.project_id),
        run.project_id
      );
    }
  }
  return rows.length;
}

function stepFailedText(step: keyof typeof CREDIT_COSTS, type: string) {
  if (step === "visuals") return isImagePost(type) ? USER_ERRORS.pictureFailed : USER_ERRORS.framesFailed;
  if (step === "voice") return USER_ERRORS.voiceFailed;
  if (step === "captions") return USER_ERRORS.captionsFailed;
  if (step === "render") return USER_ERRORS.videoFailed;
  return USER_ERRORS.textFailed;
}

/** Captions for a Reel with no voice: each scene's on-screen words, shown for that scene's share of the video. */
function sceneCaptions(script: Script): CaptionCue[] {
  const scenes = script.scenes.filter((scene) => asCaption(scene.onScreen));
  const total = Math.max(3, script.durationSec || 30);
  const each = total / Math.max(1, script.scenes.length);
  return scenes.map((scene) => {
    const index = script.scenes.indexOf(scene);
    return { start: Math.round(index * each * 10) / 10, end: Math.round((index + 1) * each * 10) / 10, text: asCaption(scene.onScreen) };
  });
}

function asCaption(text: unknown) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Reel with or without a voice. Turning it off drops the voice; either way captions and video must be made again. */
export async function setVoiceOff(userId: string, projectId: string, off: boolean) {
  const project = getProject(projectId, userId);
  if (isImagePost(String(project.type))) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  if (project.status === "generating") throw Object.assign(new Error("Wait until this step is ready."), { status: 409 });
  if ((Number(project.voice_off) === 1) === off) return serializeProject(project);
  if (!project.script_json || !project.visuals_json) {
    // Set up before the frames: nothing recorded or made yet, so only the choice is kept for the voice step.
    db.prepare(`UPDATE projects SET voice_off = ?, updated_at = datetime('now') WHERE id = ?`).run(off ? 1 : 0, projectId);
    return serializeProject(getProject(projectId, userId));
  }
  const script = parse<Script>(project.script_json)!;
  const hadVideo = hasVideoFile(projectId);
  const captionsOff = Number(project.captions_off) === 1;
  let voiceJson: string | null = null;
  let audioUrl = "";
  let captions: string | null = null;
  if (off) {
    // The recording stays kept by its words: turning the voice back on later brings it back free.
    keepCurrentVoice(projectId);
    removeVoiceFile(projectId);
    if (!captionsOff && project.captions_json) captions = JSON.stringify({ cues: sceneCaptions(script) });
  } else {
    const take = loadVoiceTake(projectId, voiceTakeKeyFor(projectId, script, voiceChoiceOf(project.voice_choice)));
    if (take) {
      voiceJson = take.voice ? JSON.stringify(take.voice) : null;
      audioUrl = `/projects/${projectId}/audio`;
      if (!captionsOff && take.captions) captions = JSON.stringify(take.captions);
    }
  }
  db.prepare(
    `UPDATE projects SET voice_off = ?, voice_json = ?, audio_url = ?, captions_json = ?, current_step = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(off ? 1 : 0, voiceJson, audioUrl, captions, off ? "voice" : audioUrl ? "voice" : "visuals", projectId);
  await settleVideo(userId, projectId, hadVideo);
  if (!hadVideo) db.prepare(`UPDATE projects SET status = 'draft' WHERE id = ?`).run(projectId);
  return serializeProject(getProject(projectId, userId));
}

/** Longest call to action: what fits the end card at a readable size. */
export const CTA_MAX = 90;

/** Cut at the last whole word, never mid-word. */
function clipWords(value: unknown, max: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : text.slice(0, max)).replace(/[\s,;:—–-]+$/, "");
}

/**
 * The owner's own wording for the script. Changed voiceover drops the voice; changed words make captions and video
 * again. A changed "what I want in the frame" touches nothing else — that frame changes when it is redone.
 */
export async function editScript(userId: string, projectId: string, raw: unknown, opts: { saveVersion?: boolean } = {}) {
  const project = getProject(projectId, userId);
  if (isImagePost(String(project.type))) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  if (project.status === "generating") throw Object.assign(new Error("Wait until this step is ready."), { status: 409 });
  const script = parse<Script>(project.script_json);
  if (!script) throw Object.assign(new Error("Generate the script first."), { status: 400 });
  const body = (raw || {}) as { scenes?: { id?: unknown; onScreen?: unknown; voiceover?: unknown; frameWish?: unknown }[]; cta?: unknown };
  const byId = new Map((Array.isArray(body.scenes) ? body.scenes : []).map((scene) => [Number(scene.id), scene]));
  const clip = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const next: Script = {
    ...script,
    // An older, longer call to action stays as it is until the owner changes it.
    cta: body.cta === undefined || String(body.cta).trim() === String(script.cta || "").trim() ? script.cta : clipWords(body.cta, CTA_MAX),
    scenes: script.scenes.map((scene) => {
      const edit = byId.get(scene.id);
      if (!edit) return scene;
      const frameWish = edit.frameWish === undefined ? scene.frameWish || "" : clip(edit.frameWish, 300);
      return {
        ...scene,
        onScreen: edit.onScreen === undefined ? scene.onScreen : clip(edit.onScreen, 120),
        voiceover: edit.voiceover === undefined ? scene.voiceover : clip(edit.voiceover, 400),
        ...(frameWish ? { frameWish } : { frameWish: undefined }),
      };
    }),
  };
  const voiceChanged = next.scenes.some((scene, i) => scene.voiceover !== script.scenes[i].voiceover);
  const wordsChanged = voiceChanged || next.cta !== script.cta || next.scenes.some((scene, i) => scene.onScreen !== script.scenes[i].onScreen);
  const wishChanged = next.scenes.some((scene, i) => (scene.frameWish || "") !== (script.scenes[i].frameWish || ""));
  if (!wordsChanged && !wishChanged) return serializeProject(project);
  if (opts.saveVersion !== false) saveStepVersion(projectId, "script", next, "");
  if (!wordsChanged) {
    db.prepare(`UPDATE projects SET script_json = ?, updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify(next), projectId);
    return serializeProject(getProject(projectId, userId));
  }
  await applyScriptWords(userId, projectId, project, next, voiceChanged);
  return serializeProject(getProject(projectId, userId));
}

/**
 * New words for a Reel. Captions under a voice follow the voice, so new on-screen words or a new call to action keep
 * them; captions without a voice are the scenes' words, made again here (free). New voiceover words need another
 * voice — unless one was already recorded for exactly these words, which comes back free with its captions.
 * A finished video is then made again (free) when everything is there, or taken down until the missing steps are done.
 */
async function applyScriptWords(userId: string, projectId: string, project: Record<string, unknown>, next: Script, voiceChanged: boolean) {
  const hadVideo = hasVideoFile(projectId);
  const voiceOff = Number(project.voice_off) === 1;
  const captionsOff = Number(project.captions_off) === 1;
  let voiceJson = (project.voice_json as string | null) || null;
  let audioUrl = String(project.audio_url || "");
  let captions = (project.captions_json as string | null) || null;
  if (!voiceOff && voiceChanged) {
    keepCurrentVoice(projectId);
    removeVoiceFile(projectId);
    voiceJson = null;
    audioUrl = "";
    captions = null;
    const take = loadVoiceTake(projectId, voiceTakeKeyFor(projectId, next, voiceChoiceOf(project.voice_choice)));
    if (take) {
      voiceJson = take.voice ? JSON.stringify(take.voice) : null;
      audioUrl = `/projects/${projectId}/audio`;
      if (!captionsOff && take.captions) captions = JSON.stringify(take.captions);
    }
  }
  if (voiceOff && !captionsOff && captions) captions = JSON.stringify({ cues: sceneCaptions(next) });
  db.prepare(
    `UPDATE projects SET script_json = ?, voice_json = ?, audio_url = ?, captions_json = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(next), voiceJson, audioUrl, captions, projectId);
  await settleVideo(userId, projectId, hadVideo);
}

/** One language for the whole Reel: the script is translated, then saved like a hand edit (voice, captions, video again). */
export async function translateReelScript(userId: string, projectId: string, rawLang: unknown) {
  const lang = rawLang === "uk" ? "uk" : rawLang === "en" ? "en" : "";
  if (!lang) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  const project = getProject(projectId, userId);
  const script = parse<Script>(project.script_json);
  if (!script || isImagePost(String(project.type))) throw Object.assign(new Error("Generate the script first."), { status: 400 });
  const brand = brandFor(userId);
  const result = await translateScript(script, lang, brand?.business_name || "");
  const before = JSON.stringify({ cta: script.cta, scenes: script.scenes.map((s) => [s.onScreen, s.voiceover]) });
  const after = JSON.stringify({ cta: result.data.cta, scenes: (result.data.scenes || []).map((s) => [s.onScreen, s.voiceover]) });
  if (!result.data?.scenes?.length || before === after) throw Object.assign(new Error(USER_ERRORS.textFailed), { status: 502 });
  return await editScript(userId, projectId, result.data);
}

/** The owner's own captions: text and timing. A finished video is made again with them straight away, free. */
export async function editCaptions(userId: string, projectId: string, raw: unknown) {
  const project = getProject(projectId, userId);
  if (isImagePost(String(project.type))) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  if (project.status === "generating") throw Object.assign(new Error("Wait until this step is ready."), { status: 409 });
  const list = Array.isArray((raw as { cues?: unknown })?.cues) ? ((raw as { cues: unknown[] }).cues as Partial<CaptionCue>[]) : [];
  const cues = list
    .slice(0, 60)
    .map((cue) => ({
      start: Math.max(0, Math.round(Number(cue.start) * 10) / 10),
      end: Math.round(Number(cue.end) * 10) / 10,
      text: String(cue.text ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
      ...(Number.isInteger(cue.scene) && Number(cue.scene) >= 0 ? { scene: Number(cue.scene) } : {}),
    }))
    .filter((cue) => cue.text && Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start)
    .sort((a, b) => a.start - b.start);
  if (!cues.length) throw Object.assign(new Error("Keep at least one caption line with a start and an end."), { status: 400 });
  if (hasVideoFile(projectId)) {
    assertCanRemake(projectId, project);
    db.prepare(`UPDATE projects SET captions_json = ?, captions_off = 0, updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify({ cues }), projectId);
    await remakeOrDrop(userId, projectId, Number(project.use_brand) === 0 ? null : brandFor(userId));
    return serializeProject(getProject(projectId, userId));
  }
  db.prepare(
    `UPDATE projects SET captions_json = ?, captions_off = 0, output_url = NULL, status = 'draft', updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify({ cues }), projectId);
  return serializeProject(getProject(projectId, userId));
}

const REEL_LOGO_SIZES = ["s", "m", "l"] as const;

/** The owner's choice for this Reel, or what their Brand Kit says: logo on photos, its corner, medium, with an end card. */
function reelLogoOf(row: Record<string, unknown>, brand: BrandKit | null): ReelLogoSettings {
  const saved = parse<Partial<ReelLogoSettings>>(row.reel_logo_json as string) || {};
  return {
    show: typeof saved.show === "boolean" ? saved.show : wantsLogoStamp(brand),
    corner: (LOGO_POSITIONS as readonly string[]).includes(String(saved.corner)) ? (saved.corner as LogoPosition) : logoPositionOf(brand),
    size: (REEL_LOGO_SIZES as readonly string[]).includes(String(saved.size)) ? (saved.size as ReelLogoSettings["size"]) : "m",
    endCard: typeof saved.endCard === "boolean" ? saved.endCard : true,
    plate: typeof saved.plate === "boolean" ? saved.plate : true,
  };
}

/** Where the Reel's logo will be, so new frames leave a calm patch exactly there; null when this Reel has no logo. */
function reelLogoSpotFor(project: Record<string, unknown>, brand: BrandKit | null) {
  if (!brand || !brandMarkPath(brand)) return null;
  const settings = reelLogoOf(project, brand);
  return settings.show ? { corner: settings.corner, size: settings.size } : null;
}

/** What goes over and after the scenes: clean frames, the small logo and the end card. */
async function reelLayers(projectId: string, project: Record<string, unknown>, brand: BrandKit | null, script: Script) {
  const frames = unstampReelFrames(projectId, parse<Visual[]>(project.visuals_json as string) || []);
  const settings = reelLogoOf(project, brand);
  const badge = brand && settings.show ? await writeReelLogoBadge(projectId, brand, settings.size, settings.plate) : null;
  const endCard = brand && settings.endCard ? await writeReelEndCard(projectId, brand, script.cta) : null;
  return { visuals: frames.visuals, framesChanged: frames.changed, logo: badge ? { ...badge, corner: settings.corner } : null, endCard };
}

/** Logo settings for a Reel. A finished video is made again straight away, free: nothing is generated. */
export async function updateReelLogo(userId: string, projectId: string, raw: unknown) {
  const project = getProject(projectId, userId);
  if (isImagePost(String(project.type))) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  if (project.status === "generating") throw Object.assign(new Error("Wait until this step is ready."), { status: 409 });
  const brand = Number(project.use_brand) === 0 ? null : brandFor(userId);
  assertCanRemake(projectId, project);
  const body = (raw || {}) as Partial<Record<keyof ReelLogoSettings, unknown>>;
  const current = reelLogoOf(project, brand);
  const next: ReelLogoSettings = {
    show: typeof body.show === "boolean" ? body.show : current.show,
    corner: (LOGO_POSITIONS as readonly string[]).includes(String(body.corner)) ? (body.corner as LogoPosition) : current.corner,
    size: (REEL_LOGO_SIZES as readonly string[]).includes(String(body.size)) ? (body.size as ReelLogoSettings["size"]) : current.size,
    endCard: typeof body.endCard === "boolean" ? body.endCard : current.endCard,
    plate: typeof body.plate === "boolean" ? body.plate : current.plate,
  };
  db.prepare(`UPDATE projects SET reel_logo_json = ? WHERE id = ?`).run(JSON.stringify(next), projectId);
  await remakeReelVideo(userId, projectId, brand);
  return serializeProject(getProject(projectId, userId));
}

function captionStyleOf(row: Record<string, unknown>): CaptionStyle {
  const value = String(row.captions_style || "");
  return (CAPTION_STYLES as readonly string[]).includes(value) ? (value as CaptionStyle) : "clean";
}

/** How the burned-in captions look. A finished video is made again straight away, free. */
export async function updateCaptionStyle(userId: string, projectId: string, raw: unknown) {
  const project = getProject(projectId, userId);
  if (isImagePost(String(project.type))) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  if (project.status === "generating") throw Object.assign(new Error("Wait until this step is ready."), { status: 409 });
  const style = String((raw as { style?: unknown })?.style || "");
  if (!(CAPTION_STYLES as readonly string[]).includes(style)) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  if (Number(project.captions_off) !== 1) assertCanRemake(projectId, project);
  db.prepare(`UPDATE projects SET captions_style = ? WHERE id = ?`).run(style, projectId);
  const brand = Number(project.use_brand) === 0 ? null : brandFor(userId);
  if (Number(project.captions_off) !== 1) await remakeReelVideo(userId, projectId, brand);
  return serializeProject(getProject(projectId, userId));
}

function reelTitlesOf(row: Record<string, unknown>): ReelTitles {
  const saved = parse<Partial<ReelTitles>>(row.titles_json as string | null) || {};
  return {
    show: saved.show !== false,
    style: (CAPTION_STYLES as readonly string[]).includes(String(saved.style)) ? (saved.style as ReelTitles["style"]) : "clean",
    size: (REEL_TITLE_SIZES as readonly string[]).includes(String(saved.size)) ? (saved.size as ReelTitles["size"]) : "m",
  };
}

/** The scene headlines at the top: shown or not, their look and size. A finished video is made again straight away, free. */
export async function updateReelTitles(userId: string, projectId: string, raw: unknown) {
  const project = getProject(projectId, userId);
  if (isImagePost(String(project.type))) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  if (project.status === "generating") throw Object.assign(new Error("Wait until this step is ready."), { status: 409 });
  const body = (raw || {}) as Partial<Record<keyof ReelTitles, unknown>>;
  const current = reelTitlesOf(project);
  const next: ReelTitles = {
    show: typeof body.show === "boolean" ? body.show : current.show,
    style: (CAPTION_STYLES as readonly string[]).includes(String(body.style)) ? (body.style as ReelTitles["style"]) : current.style,
    size: (REEL_TITLE_SIZES as readonly string[]).includes(String(body.size)) ? (body.size as ReelTitles["size"]) : current.size,
  };
  const voiced = Number(project.voice_off) !== 1;
  if (voiced) assertCanRemake(projectId, project);
  db.prepare(`UPDATE projects SET titles_json = ? WHERE id = ?`).run(JSON.stringify(next), projectId);
  const brand = Number(project.use_brand) === 0 ? null : brandFor(userId);
  // Without a voice there are no headlines in the video, so nothing to make again.
  if (voiced) await remakeReelVideo(userId, projectId, brand);
  return serializeProject(getProject(projectId, userId));
}

/** Captions made earlier from the current voice, if they are still kept. */
function keptTakeCaptions(projectId: string, script: Script, voice: string) {
  const take = loadVoiceTakeMeta(projectId, voiceTakeKeyFor(projectId, script, voice));
  return take?.captions || null;
}

/** A render was charged on this Reel before: every later one is free. */
function renderPaidBefore(projectId: string) {
  const row = db
    .prepare(`SELECT 1 FROM ai_generations WHERE project_id = ? AND type = 'render' AND status = 'succeeded' AND credits_used > 0 LIMIT 1`)
    .get(projectId);
  return Boolean(row);
}

/** Everything a Reel video is made from is there: frames, the voice (or "no voice"), captions (or "no captions"). */
function reelInputsReady(projectId: string, row: Record<string, unknown>) {
  const frames = parse<Visual[]>(row.visuals_json as string) || [];
  if (!row.script_json || !frames.length) return false;
  if (Number(row.voice_off) !== 1 && !hasVoiceFile(projectId)) return false;
  if (Number(row.captions_off) !== 1 && !row.captions_json) return false;
  return true;
}

/**
 * After a change to a finished Reel: make the video again straight away when everything for it is there (free);
 * otherwise take it down, so the owner finishes the missing steps (the video step itself is free by then).
 */
/**
 * Keep the current recording (with its captions) under its words and voice before it is removed, so going back to
 * these words brings it back free — also for voices recorded before takes were kept.
 */
function keepCurrentVoice(projectId: string) {
  const row = db.prepare("SELECT script_json, voice_json, voice_choice, voice_off, captions_off, captions_json FROM projects WHERE id = ?").get(projectId) as
    | Record<string, unknown>
    | undefined;
  const script = parse<Script>(row?.script_json as string | null);
  if (!row || !script || Number(row.voice_off) === 1 || !hasVoiceFile(projectId)) return;
  // Kept under the voice it was actually read in, not the one picked since.
  const said = parse<{ voiceId?: unknown; voice?: unknown }>(row.voice_json as string | null);
  const recorded = [said?.voiceId, said?.voice].find((name) => (VOICE_CHOICES as readonly string[]).includes(String(name)));
  const voice = voiceChoiceOf(recorded || row.voice_choice);
  if (hasVoiceTake(projectId, voiceTakeKeyFor(projectId, script, voice))) return;
  const key = voiceTakeKey(script, voice);
  saveVoiceTake(projectId, key, parse(row.voice_json as string | null));
  if (Number(row.captions_off) !== 1 && row.captions_json) saveTakeCaptions(projectId, key, parse(row.captions_json as string));
}

async function settleVideo(userId: string, projectId: string, hadVideo: boolean, brand?: BrandKit | null) {
  if (!hadVideo) return;
  const row = getProject(projectId, userId);
  const owner = brand === undefined ? (Number(row.use_brand) === 0 ? null : brandFor(userId)) : brand;
  if (hasVideoFile(projectId) && reelInputsReady(projectId, row)) {
    try {
      await remakeReelVideo(userId, projectId, owner);
      db.prepare(`UPDATE projects SET status = 'ready', output_url = ?, updated_at = datetime('now') WHERE id = ?`).run(`/projects/${projectId}/file`, projectId);
      return;
    } catch (error) {
      console.error("reel remake failed", error instanceof Error ? error.message : error);
    }
  }
  removeVideoFile(projectId);
  db.prepare(`UPDATE projects SET output_url = NULL, status = 'draft', updated_at = datetime('now') WHERE id = ?`).run(projectId);
}

/** The voice is kept 7 days after the last change; without it a finished Reel cannot be re-made for free. */
const REMAKE_NO_VOICE = "The voice for this Reel is no longer kept (we keep it 7 days), so the video can't be updated for free. Make the voice again, then the video.";

function assertCanRemake(projectId: string, project: Record<string, unknown>) {
  if (!hasVideoFile(projectId)) return;
  if (Number(project.voice_off) !== 1 && !hasVoiceFile(projectId)) throw Object.assign(new Error(REMAKE_NO_VOICE), { status: 409 });
}

/** "Update the video": the same Reel made again with what is there now — free, no AI. */
export async function refreshReelVideo(userId: string, projectId: string) {
  const project = getProject(projectId, userId);
  if (isImagePost(String(project.type))) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  if (project.status === "generating") throw Object.assign(new Error("Wait until this step is ready."), { status: 409 });
  if (!hasVideoFile(projectId)) throw Object.assign(new Error("Make the video first."), { status: 400 });
  assertCanRemake(projectId, project);
  await remakeOrDrop(userId, projectId, Number(project.use_brand) === 0 ? null : brandFor(userId));
  return serializeProject(getProject(projectId, userId));
}

/** Which voice reads this Reel. Takes effect on the next recording; a recording already made stays as it is. */
export function setVoiceChoice(userId: string, projectId: string, raw: unknown) {
  const project = getProject(projectId, userId);
  if (isImagePost(String(project.type))) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  if (!(VOICE_CHOICES as readonly string[]).includes(String(raw))) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  db.prepare(`UPDATE projects SET voice_choice = ?, updated_at = datetime('now') WHERE id = ?`).run(String(raw), projectId);
  return serializeProject(getProject(projectId, userId));
}

/** Make the finished Reel again. The old video stays if that fails — the owner can try again. */
async function remakeOrDrop(userId: string, projectId: string, brand: BrandKit | null) {
  try {
    await remakeReelVideo(userId, projectId, brand);
  } catch (error) {
    console.error("reel remake failed", error instanceof Error ? error.message : error);
    throw Object.assign(new Error("We couldn't update the video. Try again in a minute."), { status: 409 });
  }
}

/** The same Reel made again from what is already there — frames, voice, captions, music — when only its look changed. */
async function remakeReelVideo(userId: string, projectId: string, brand: BrandKit | null) {
  const project = getProject(projectId, userId);
  const script = parse<Script>(project.script_json);
  if (script && hasVideoFile(projectId)) {
    const layers = await reelLayers(projectId, project, brand, script);
    await renderReel({
      projectId,
      script,
      visuals: layers.visuals,
      captions: Number(project.captions_off) === 1 ? null : parse<{ cues: CaptionCue[] }>(project.captions_json),
      primaryColor: brand?.primary_color,
      silent: Number(project.voice_off) === 1,
      music: hasMusicFile(projectId) ? reelMusicOf(project) : null,
      logo: layers.logo,
      endCard: layers.endCard,
      captionStyle: captionStyleOf(project),
      titles: reelTitlesOf(project),
      brand,
    });
    if (layers.framesChanged) db.prepare(`UPDATE projects SET visuals_json = ? WHERE id = ?`).run(JSON.stringify(layers.visuals), projectId);
  }
  db.prepare(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`).run(projectId);
}

function reelMusicOf(row: Record<string, unknown>): ReelMusic {
  const volume = Number(row.music_volume);
  return { volume: Number.isFinite(volume) ? volume : 50, start: Math.max(0, Number(row.music_start) || 0) };
}

function musicProject(userId: string, projectId: string) {
  const project = getProject(projectId, userId);
  if (isImagePost(String(project.type))) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  if (!project.script_json) throw Object.assign(new Error("Generate the script first."), { status: 400 });
  if (project.status === "generating") throw Object.assign(new Error("Wait until this step is ready."), { status: 409 });
  assertCanRemake(projectId, project);
  return project;
}

/** A finished Reel gets the new sound straight away (picture copied as it is, no credits). */
async function remixAfterMusicChange(userId: string, projectId: string) {
  const project = getProject(projectId, userId);
  await remixReelAudio({
    projectId,
    music: hasMusicFile(projectId) ? reelMusicOf(project) : null,
    silent: Number(project.voice_off) === 1,
  });
  db.prepare(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`).run(projectId);
  return serializeProject(getProject(projectId, userId));
}

/** The owner's own track under the Reel. */
export async function setMusic(userId: string, projectId: string, buf: Buffer, rawName: unknown) {
  musicProject(userId, projectId);
  const seconds = await writeMusicFromUpload(projectId, buf);
  const name = String(rawName || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || "music";
  db.prepare(`UPDATE projects SET music_name = ?, music_duration = ?, music_start = 0 WHERE id = ?`).run(name, seconds, projectId);
  return remixAfterMusicChange(userId, projectId);
}

export async function updateMusic(userId: string, projectId: string, raw: unknown) {
  const project = musicProject(userId, projectId);
  if (!hasMusicFile(projectId)) throw Object.assign(new Error("Add a music file first."), { status: 400 });
  const body = (raw || {}) as { volume?: unknown; start?: unknown };
  const current = reelMusicOf(project);
  const volume = body.volume === undefined ? current.volume : Math.round(Math.max(0, Math.min(100, Number(body.volume) || 0)));
  const longest = Math.max(0, (Number(project.music_duration) || 0) - 1);
  const start = body.start === undefined ? current.start : Math.round(Math.max(0, Math.min(longest, Number(body.start) || 0)) * 10) / 10;
  db.prepare(`UPDATE projects SET music_volume = ?, music_start = ? WHERE id = ?`).run(volume, start, projectId);
  return remixAfterMusicChange(userId, projectId);
}

export async function removeMusic(userId: string, projectId: string) {
  musicProject(userId, projectId);
  removeMusicFile(projectId);
  db.prepare(`UPDATE projects SET music_name = '', music_duration = 0, music_start = 0 WHERE id = ?`).run(projectId);
  return remixAfterMusicChange(userId, projectId);
}

/**
 * Reel with or without burned-in captions. A finished video is made again straight away, free — except turning
 * captions back on under a voice: those come from the voice (AI), so captions and video are made again as steps.
 */
export async function setCaptionsOff(userId: string, projectId: string, off: boolean) {
  const project = getProject(projectId, userId);
  if (isImagePost(String(project.type))) throw Object.assign(new Error(USER_ERRORS.refresh), { status: 400 });
  if (project.status === "generating") throw Object.assign(new Error("Wait until this step is ready."), { status: 409 });
  if ((Number(project.captions_off) === 1) === off) return serializeProject(project);
  const voiceStepDone = Number(project.voice_off) === 1 || hasVoiceFile(projectId);
  if (!project.script_json || !project.visuals_json || (!voiceStepDone && !project.captions_json && !hasVideoFile(projectId))) {
    // Set up before the captions step: nothing made yet, so only the choice is kept for later.
    db.prepare(`UPDATE projects SET captions_off = ?, updated_at = datetime('now') WHERE id = ?`).run(off ? 1 : 0, projectId);
    return serializeProject(getProject(projectId, userId));
  }
  const script = parse<Script>(project.script_json);
  const keptCaptions =
    !off && script && Number(project.voice_off) !== 1 && hasVoiceFile(projectId) ? keptTakeCaptions(projectId, script, voiceChoiceOf(project.voice_choice)) : null;
  if (hasVideoFile(projectId) && script && (off || Number(project.voice_off) === 1 || keptCaptions)) {
    assertCanRemake(projectId, project);
    db.prepare(`UPDATE projects SET captions_off = ?, captions_json = ?, updated_at = datetime('now') WHERE id = ?`).run(
      off ? 1 : 0,
      off ? null : keptCaptions ? JSON.stringify(keptCaptions) : JSON.stringify({ cues: sceneCaptions(script) }),
      projectId
    );
    await remakeOrDrop(userId, projectId, Number(project.use_brand) === 0 ? null : brandFor(userId));
    return serializeProject(getProject(projectId, userId));
  }
  removeVideoFile(projectId);
  db.prepare(
    `UPDATE projects SET captions_off = ?, captions_json = CASE WHEN ? = 1 THEN NULL ELSE captions_json END,
       output_url = NULL, status = 'draft', current_step = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(off ? 1 : 0, off ? 1 : 0, off ? "captions" : "voice", projectId);
  return serializeProject(getProject(projectId, userId));
}

function downstreamWipe(step: keyof typeof CREDIT_COSTS, _singleFrame = false): Record<string, string | number | null> {
  if (step === "idea") {
    return {
      script_json: null,
      visuals_json: null,
      voice_json: null,
      captions_json: null,
      audio_url: "",
      output_url: null,
      status: "draft",
    };
  }
  if (step === "script") {
    return {
      visuals_json: null,
      voice_json: null,
      captions_json: null,
      audio_url: "",
      output_url: null,
      status: "draft",
    };
  }
  if (step === "visuals" || step === "captions") {
    return { output_url: null, status: "draft" };
  }
  if (step === "voice") {
    return { captions_json: null, output_url: null, status: "draft" };
  }
  return {};
}
