import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const ffmpegPath = (require("ffmpeg-static") as string | null) || "ffmpeg";

export function runFfmpeg(args: string[]) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/** A rendered PNG as a print JPEG (high quality), through a temp file in `dir`. */
export async function pngToJpeg(png: Buffer, dir: string) {
  const tmpPng = path.join(dir, `print-${randomUUID()}.png`);
  const tmpJpg = tmpPng.replace(/\.png$/, ".jpg");
  try {
    fs.writeFileSync(tmpPng, png);
    if (!(await runFfmpeg(["-i", tmpPng, "-q:v", "2", tmpJpg])) || !fs.existsSync(tmpJpg)) {
      throw Object.assign(new Error("We couldn’t make the PDF. Try again in a minute."), { status: 500 });
    }
    return fs.readFileSync(tmpJpg);
  } finally {
    fs.rmSync(tmpPng, { force: true });
    fs.rmSync(tmpJpg, { force: true });
  }
}

/** One page PDF holding a JPEG edge to edge on a page of `page` points (1/72 inch). No extra dependency: the format is simple. */
export function pdfWithJpeg(jpeg: Buffer, w: number, h: number, page: { w: number; h: number }) {
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Buffer) => {
    const buf = typeof part === "string" ? Buffer.from(part, "latin1") : part;
    chunks.push(buf);
    length += buf.length;
  };
  const object = (n: number, body: (string | Buffer)[]) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    body.forEach(push);
    push("\nendobj\n");
  };
  const draw = `q ${page.w} 0 0 ${page.h} 0 0 cm /Im0 Do Q`;
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  object(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.w} ${page.h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
  object(4, [
    `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    jpeg,
    "\nendstream",
  ]);
  object(5, [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`]);
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}
