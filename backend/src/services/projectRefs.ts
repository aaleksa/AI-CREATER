import fs from "node:fs";
import path from "node:path";
import { logoKindFromBytes, type BrandImageFile } from "./brandAssets.js";
import { projectMediaDir, projectMediaPath } from "./media.js";

/** Example pictures a person attaches to one brief. Independent of the Brand Kit. */
export const MAX_EXAMPLE_REFS = 3;
export const EXAMPLE_PREFIX = "example-";
const SLOTS = ["1", "2", "3"] as const;

export function isExampleSlot(value: string) {
  return (SLOTS as readonly string[]).includes(value);
}

function mimeOf(file: string) {
  const ext = path.extname(file).toLowerCase();
  return ext === ".png" ? "image/png" : ext === ".jpg" ? "image/jpeg" : "";
}

function findSlot(projectId: string, slot: string) {
  const dir = projectMediaPath(projectId);
  if (!fs.existsSync(dir)) return "";
  const found = fs.readdirSync(dir).find((name) => new RegExp(`^${EXAMPLE_PREFIX}${slot}\\.(png|jpg)$`).test(name));
  return found ? path.join(dir, found) : "";
}

export function exampleRefFile(projectId: string, slot: string) {
  const file = isExampleSlot(slot) ? findSlot(projectId, slot) : "";
  const type = file ? mimeOf(file) : "";
  return file && type && fs.statSync(file).size > 0 ? { file, type } : null;
}

export function listExampleRefs(projectId: string): BrandImageFile[] {
  const out: BrandImageFile[] = [];
  for (const slot of SLOTS) {
    const ref = exampleRefFile(projectId, slot);
    if (ref) out.push({ slot: "place", file: ref.file, type: ref.type, filename: `example-${slot}${path.extname(ref.file)}` });
  }
  return out;
}

export function exampleRefList(projectId: string) {
  return SLOTS.filter((slot) => exampleRefFile(projectId, slot)).map((slot) => ({
    id: slot,
    url: `/projects/${projectId}/refs/${slot}`,
  }));
}

/** Parses a data URL like the Brand Kit uploads do. */
export function readExampleUpload(raw: unknown) {
  const match = String(raw || "").match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!match) return { error: "Use a PNG or JPG under 2 MB." };
  const declared = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 2 * 1024 * 1024) return { error: "That file is too large. Keep it under 2 MB." };
  const kind = logoKindFromBytes(buffer);
  if (!kind || kind !== declared) return { error: "Use a PNG or JPG under 2 MB." };
  return { buffer, kind };
}

export function addExampleRef(projectId: string, buffer: Buffer, ext: "png" | "jpg") {
  const slot = SLOTS.find((s) => !exampleRefFile(projectId, s));
  if (!slot) throw Object.assign(new Error("You can add up to 3 example pictures."), { status: 400 });
  const file = path.join(projectMediaDir(projectId), `${EXAMPLE_PREFIX}${slot}.${ext}`);
  fs.writeFileSync(file, buffer);
  return slot;
}

export function removeExampleRef(projectId: string, slot: string) {
  const file = isExampleSlot(slot) ? findSlot(projectId, slot) : "";
  if (file) fs.rmSync(file, { force: true });
}
