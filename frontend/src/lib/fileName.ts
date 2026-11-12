import type { Project } from "./api";
import { isPosterKind } from "./api";

type T = (path: string, vars?: Record<string, string | number>) => string;

const SHAPE: Record<string, string> = {
  square: "1x1",
  portrait: "4x5",
  portrait34: "3x4",
  story: "9x16",
  wide: "1.91x1",
  a5: "A5",
  a5p: "A",
  tall: "2x3",
};

/** "портрет 4:5", "сторіз 9:16" — the shape of a picture in a few characters. */
export function shapeLabel(shape: string, t: T) {
  if (!SHAPE[shape]) return "";
  if (shape === "a5" || shape === "a5p" || shape === "portrait34") return t(`fileName.${shape}`);
  return `${t(`fileName.${shape}`)} ${SHAPE[shape].replace("x", ":")}`;
}

/** Words of the title, safe for a file name on any computer. Letters of any alphabet stay. */
function slug(text: string, max = 40) {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  let out = "";
  for (const word of words) {
    const next = out ? `${out}-${word}` : word;
    if (next.length > max) break;
    out = next;
  }
  return out || words[0]?.slice(0, max) || "";
}

/** Guess from the brief / idea when a take never had a language remake. */
function languageFromText(project: Project) {
  const text = `${project.idea?.title || ""} ${project.invite?.name || ""} ${project.prompt || ""}`;
  const cyr = (text.match(/\p{Script=Cyrillic}/gu) || []).length;
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  return cyr > lat ? "uk" : "en";
}

/**
 * Language tag for the download name.
 * Prefer the take on screen (its remake chain). Do not reuse the project's accepted
 * language when this take never declared one — the brief decides instead.
 */
function languageOf(
  project: Project,
  take?: { language?: string | null }
) {
  const fromTake = take?.language;
  if (fromTake === "en" || fromTake === "uk") return fromTake;
  if (take && (fromTake === "" || fromTake == null)) return languageFromText(project);
  if (project.pictureLanguage === "en" || project.pictureLanguage === "uk") return project.pictureLanguage;
  return languageFromText(project);
}

/**
 * "invitation_free-yoga-classes_UA_story-9x16.jpg": what it is, what it is for, the language of its words and its shape.
 * Photo posts carry no words, so they have no language part.
 * Pass `take` for the version on screen — its own shape and language, not only the accepted project's.
 */
export function downloadName(
  project: Project,
  t: T,
  ext: "jpg" | "mp4",
  take?: { shape?: string | null; language?: string | null }
) {
  const video = ext === "mp4";
  const intent = project.imageIntent || "";
  const kind = video
    ? t("fileName.reel")
    : isPosterKind(intent)
      ? t(`fileName.${intent}`)
      : t("fileName.photo");
  const subject = slug(project.invite?.name || project.idea?.title || project.prompt || "");
  const words = video || (intent && intent !== "photo");
  const lang = words ? t(languageOf(project, take) === "uk" ? "fileName.uk" : "fileName.en") : "";
  const shape = video
    ? "story"
    : String(take?.shape || project.imageFormat || "") || (intent && intent !== "photo" ? "tall" : "square");
  const format = !SHAPE[shape]
    ? t(`fileName.${shape}`) || shape
    : shape === "portrait34" || shape === "a5" || shape === "a5p"
      ? t(`fileName.${shape}`)
      : `${t(`fileName.${shape}`)}-${SHAPE[shape]}`;
  return `${[kind, subject, lang, format].filter(Boolean).join("_")}.${ext}`;
}
