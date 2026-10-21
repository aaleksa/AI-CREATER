/** The server takes PNG or JPG up to 2 MB. Phones give bigger photos, WebP or HEIC — we shrink and convert here. */
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SIDE = 2048;

export class ImageUploadError extends Error {
  constructor(public reason: "unreadable" | "tooBig") {
    super(reason);
  }
}

function asDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new ImageUploadError("unreadable"));
    reader.readAsDataURL(blob);
  });
}

function decode(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageUploadError("unreadable"));
    };
    img.src = url;
  });
}

function encode(img: HTMLImageElement, side: number, type: "image/png" | "image/jpeg", quality: number) {
  // An SVG without its own size reports 0×0.
  const w = img.naturalWidth || 1024;
  const h = img.naturalHeight || 1024;
  const scale = Math.min(1, side / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  if (type === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Any picture the browser can open, as a PNG or JPG data URL under 2 MB.
 * keepAlpha keeps a transparent logo as PNG; photos become JPG.
 */
/** What the file really is. A picture saved from the web is often WebP under a .jpg or .png name. */
async function realType(file: File) {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  return "";
}

export async function prepareImage(file: File, { keepAlpha = false } = {}): Promise<string> {
  const actual = await realType(file);
  if (actual && file.size <= MAX_BYTES) return asDataUrl(new Blob([file], { type: actual }));
  const img = await decode(file);
  const type = keepAlpha ? "image/png" : "image/jpeg";
  for (const side of [MAX_SIDE, 1600, 1200, 900]) {
    for (const quality of type === "image/jpeg" ? [0.9, 0.8, 0.7] : [1]) {
      const blob = await encode(img, side, type, quality);
      if (blob && blob.size <= MAX_BYTES) return asDataUrl(blob);
    }
  }
  throw new ImageUploadError("tooBig");
}
