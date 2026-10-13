// Generates the app icons in public/icons/ from public/kibo-mark.svg with sharp (a dev dependency already used).
// Usage: `node scripts/make-icons.mjs`. The PNGs are committed; re-run only when the mark changes.
// "any" icons: the mark on white with a little margin. Maskable and Apple icons: on cream, the mark inside the
// central 60% so a circle or rounded-square mask never cuts it (the maskable safe zone is a circle of 80%).

import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";

const mark = readFileSync("public/kibo-mark.svg");
mkdirSync("public/icons", { recursive: true });

async function icon(file, size, inner, background) {
  const glyph = await sharp(mark, { density: 72 * (inner / 64) * 2 })
    .resize(inner, inner)
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: glyph, gravity: "center" }])
    .png()
    .toFile(`public/icons/${file}`);
}

const WHITE = "#FFFFFF";
const CREAM = "#FBF7EF";
await icon("icon-192.png", 192, 160, WHITE);
await icon("icon-512.png", 512, 424, WHITE);
await icon("maskable-512.png", 512, 308, CREAM);
await icon("apple-touch-icon.png", 180, 128, CREAM);
console.log("icons written to public/icons/");
