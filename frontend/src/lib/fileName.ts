import type { Project } from "./api";

type T = (path: string, vars?: Record<string, string | number>) => string;

const SHAPE: Record<string, string> = {
  square: "1x1",
  portrait: "4x5",
  portrait34: "3x4",
  story: "9x16",
  wide: "1.91x1",
  tall: "2x3",
};

/** "портрет 4:5", "сторіз 9:16" — the shape of a picture in a few characters. */
export function shapeLabel(shape: string, t: T) {
  return SHAPE[shape] ? `${t(`fileName.${shape}`)} ${SHAPE[shape].replace("x", ":")}` : "";
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

function languageOf(project: Project) {
  if (project.pictureLanguage) return project.pictureLanguage;
  const text = `${project.idea?.title || ""} ${project.invite?.name || ""} ${project.prompt || ""}`;
  const cyr = (text.match(/\p{Script=Cyrillic}/gu) || []).length;
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  return cyr > lat ? "uk" : "en";
}

/**
 * "invitation_free-yoga-classes_UA_story-9x16.jpg": what it is, what it is for, the language of its words and its shape.
 * Photo posts carry no words, so they have no language part.
 */
export function downloadName(project: Project, t: T, ext: "jpg" | "mp4") {
  const video = ext === "mp4";
  const intent = project.imageIntent || "";
  const kind = video
    ? t("fileName.reel")
    : intent === "invite" || intent === "info" || intent === "offer"
      ? t(`fileName.${intent}`)
      : t("fileName.photo");
  const subject = slug(project.invite?.name || project.idea?.title || project.prompt || "");
  const words = video || (intent && intent !== "photo");
  const lang = words ? t(languageOf(project) === "uk" ? "fileName.uk" : "fileName.en") : "";
  const shape = video ? "story" : project.imageFormat || (intent && intent !== "photo" ? "tall" : "square");
  const format = `${t(`fileName.${shape}`)}-${SHAPE[shape] || ""}`;
  return `${[kind, subject, lang, format].filter(Boolean).join("_")}.${ext}`;
}
