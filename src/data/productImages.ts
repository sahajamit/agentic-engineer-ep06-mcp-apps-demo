import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const imagesDir = path.join(here, "images");

// Cache base64 data URIs at module load. Prefers .jpg (smaller payload) then
// falls back to .png. Returns null if no image is on disk so the widget can
// render its gradient fallback.
const cache = new Map<string, string | null>();

const FORMATS: { ext: string; mime: string }[] = [
  { ext: ".jpg", mime: "image/jpeg" },
  { ext: ".jpeg", mime: "image/jpeg" },
  { ext: ".png", mime: "image/png" },
];

export function productImage(id: string): string | null {
  if (cache.has(id)) return cache.get(id) ?? null;
  for (const { ext, mime } of FORMATS) {
    const file = path.join(imagesDir, `${id}${ext}`);
    if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file);
    const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
    cache.set(id, dataUri);
    return dataUri;
  }
  cache.set(id, null);
  return null;
}
