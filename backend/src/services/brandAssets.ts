import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data");

export const BRAND_REF_SLOTS = ["place", "people", "product"] as const;
export type BrandRefSlot = (typeof BRAND_REF_SLOTS)[number];
export type BrandImageSlot = "logo" | BrandRefSlot;

export function isBrandRefSlot(value: string): value is BrandRefSlot {
  return (BRAND_REF_SLOTS as readonly string[]).includes(value);
}

export function brandKitDir(userId: string) {
  const dir = path.join(dataDir, "media", "brand", userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function brandLogoDir(userId: string) {
  return brandKitDir(userId);
}

function mimeOf(file: string) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "";
}

function findNamed(userId: string, stem: string) {
  const dir = path.join(dataDir, "media", "brand", userId);
  if (!fs.existsSync(dir)) return "";
  const found = fs.readdirSync(dir).find((name) => new RegExp(`^${stem}\\.(png|jpe?g)$`, "i").test(name));
  return found ? path.join(dir, found) : "";
}

export function brandLogoPath(userId: string) {
  return findNamed(userId, "logo");
}

export function brandRefPath(userId: string, slot: BrandRefSlot) {
  return findNamed(userId, `ref-${slot}`);
}

export function brandLogoType(userId: string) {
  const file = brandLogoPath(userId);
  const type = file ? mimeOf(file) : "";
  if (!file || !type) return null;
  return { file, type };
}

export function brandRefType(userId: string, slot: BrandRefSlot) {
  const file = brandRefPath(userId, slot);
  const type = file ? mimeOf(file) : "";
  if (!file || !type) return null;
  return { file, type };
}

export function logoKindFromBytes(buffer: Buffer): "png" | "jpg" | "" {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  return "";
}

function hasFile(file: string) {
  return Boolean(file && fs.existsSync(file) && fs.statSync(file).size > 0);
}

export function hasBrandLogo(userId: string) {
  return hasFile(brandLogoPath(userId));
}

export function hasBrandRef(userId: string, slot: BrandRefSlot) {
  return hasFile(brandRefPath(userId, slot));
}

function writeNamed(userId: string, stem: string, buffer: Buffer, ext: string) {
  const safe = ext === "png" || ext === "jpg" || ext === "jpeg" ? (ext === "jpeg" ? "jpg" : ext) : "";
  if (!safe) throw Object.assign(new Error("Use a PNG or JPG under 2 MB. SVG is not allowed."), { status: 400 });
  const dir = brandKitDir(userId);
  for (const name of fs.readdirSync(dir)) {
    if (name.toLowerCase().startsWith(`${stem}.`)) fs.rmSync(path.join(dir, name), { force: true });
  }
  const file = path.join(dir, `${stem}.${safe}`);
  fs.writeFileSync(file, buffer);
  return file;
}

export function writeBrandLogo(userId: string, buffer: Buffer, ext: string) {
  return writeNamed(userId, "logo", buffer, ext);
}

export function writeBrandRef(userId: string, slot: BrandRefSlot, buffer: Buffer, ext: string) {
  return writeNamed(userId, `ref-${slot}`, buffer, ext);
}

export function removeBrandLogo(userId: string) {
  const dir = path.join(dataDir, "media", "brand", userId);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (/^logo\./i.test(name)) fs.rmSync(path.join(dir, name), { force: true });
  }
}

export function removeBrandRef(userId: string, slot: BrandRefSlot) {
  const dir = path.join(dataDir, "media", "brand", userId);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (new RegExp(`^ref-${slot}\\.`, "i").test(name)) fs.rmSync(path.join(dir, name), { force: true });
  }
}

export function removeBrandKitFiles(userId: string) {
  fs.rmSync(path.join(dataDir, "media", "brand", userId), { recursive: true, force: true });
}

export function brandImageUrls(userId: string) {
  return {
    logo_url: hasBrandLogo(userId) ? "/brand/logo" : "",
    ref_place_url: hasBrandRef(userId, "place") ? "/brand/ref/place" : "",
    ref_people_url: hasBrandRef(userId, "people") ? "/brand/ref/people" : "",
    ref_product_url: hasBrandRef(userId, "product") ? "/brand/ref/product" : "",
  };
}

export type BrandImageFile = {
  slot: BrandImageSlot;
  file: string;
  type: string;
  filename: string;
};

export function listBrandImageFiles(userId: string): BrandImageFile[] {
  const out: BrandImageFile[] = [];
  const logo = brandLogoType(userId);
  if (logo) out.push({ slot: "logo", file: logo.file, type: logo.type, filename: path.basename(logo.file) });
  out.push(...listBrandRefFiles(userId));
  return out;
}

export function listBrandRefFiles(userId: string): BrandImageFile[] {
  const out: BrandImageFile[] = [];
  for (const slot of BRAND_REF_SLOTS) {
    const ref = brandRefType(userId, slot);
    if (ref) out.push({ slot, file: ref.file, type: ref.type, filename: path.basename(ref.file) });
  }
  return out;
}
