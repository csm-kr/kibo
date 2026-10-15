import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

// Cuts the dark recording frame off the /learn replay frames in public/learn/<run>/ (GitHub #1 item 17):
// `npx tsx scripts/learn-trim.ts [run …]`. The learner recorded a 720×1067 page with the kiosk drawn smaller inside
// it, so /learn showed a black box around the kiosk. Each run is cut to one box (every frame the same size, so the
// picture does not jump between turns), never into the kiosk: a frame with more than a few stray pixels outside the
// box stops the run. Re-encoded to WebP <= 60 KB per frame and <= 5 MB per run, and run.json gets the new sizes.
// Idempotent: a trimmed run has no frame left, so a second pass changes nothing. Run it again after
// `npm run learn:runs`, which copies the frames from the traces as they were recorded.

const OUT = "public/learn";
const MAX_IMAGE_BYTES = 60 * 1024;
const MAX_RUN_BYTES = 5 * 1024 * 1024;
/** A column or row is frame when this share of its pixels is the frame colour. */
const FRAME_SHARE = 0.97;
/** Per channel, how far a pixel may be from the frame colour (WebP blurs the edge). */
const TOLERANCE = 24;
/** The frame is dark: every channel of its colour at most this. */
const DARK = 64;
/** Pixels outside the run's box that are not frame colour, as a share of the cut area, before the run stops. */
const MAX_STRAY = 0.005;
/** WebP blurs the kiosk's edge into the frame by a pixel or two; that band is not counted as kiosk. */
const EDGE = 2;

export interface Raw {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function frameTest(raw: Raw) {
  const { data, width, height, channels } = raw;
  // The frame colour, sampled one row above the bottom-left corner: the last row can be a light line.
  const i0 = ((height - 2) * width + 1) * channels;
  const ref = [data[i0], data[i0 + 1], data[i0 + 2]];
  const dark = ref.every((c) => c <= DARK);
  const isFrame = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return Math.abs(data[i] - ref[0]) <= TOLERANCE && Math.abs(data[i + 1] - ref[1]) <= TOLERANCE && Math.abs(data[i + 2] - ref[2]) <= TOLERANCE;
  };
  return { dark, isFrame };
}

/**
 * The kiosk's part of one recorded screenshot: what is left inside a dark frame on the left and the right (and maybe
 * the top and bottom). Null when there is no such frame, such as a full-page kiosk on its own light background or
 * a dark cart bar along one edge. The last row is ignored: some recordings end in a 1px light line.
 */
export function kioskBox(raw: Raw): Box | null {
  const { width, height } = raw;
  const { dark, isFrame } = frameTest(raw);
  if (!dark) return null;
  const rows = height - 1;
  const col = (x: number) => {
    let n = 0;
    for (let y = 0; y < rows; y++) if (isFrame(x, y)) n++;
    return n / rows >= FRAME_SHARE;
  };
  const row = (y: number) => {
    let n = 0;
    for (let x = 0; x < width; x++) if (isFrame(x, y)) n++;
    return n / width >= FRAME_SHARE;
  };
  let left = 0;
  while (left < width && col(left)) left++;
  let right = width - 1;
  while (right > left && col(right)) right--;
  if (left === 0 || right === width - 1 || right <= left) return null;
  let top = 0;
  while (top < rows && row(top)) top++;
  let bottom = rows - 1;
  while (bottom > top && row(bottom)) bottom--;
  // No frame under the kiosk: the last row is the kiosk's own.
  if (bottom === rows - 1) bottom = height - 1;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Pixels outside `box` and its blurred edge (last row aside) that are not the frame colour, as a share of that area. */
export function strayOutside(raw: Raw, box: Box): number {
  const { width, height } = raw;
  const { isFrame } = frameTest(raw);
  let stray = 0;
  let area = 0;
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= box.left - EDGE && x < box.left + box.width + EDGE && y >= box.top - EDGE && y < box.top + box.height + EDGE) continue;
      area++;
      if (!isFrame(x, y)) stray++;
    }
  }
  return area ? stray / area : 0;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function readRaw(file: string): Promise<Raw> {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

async function encode(file: string, box: Box): Promise<Buffer> {
  // Start high: the frames are already lossy WebP, and a second pass at a low quality would blur kiosk text.
  for (const quality of [90, 85, 80, 75, 70, 60, 50]) {
    const buf = await sharp(file).extract(box).webp({ quality }).toBuffer();
    if (buf.length <= MAX_IMAGE_BYTES) return buf;
  }
  throw new Error(`${file}: cannot fit ${MAX_IMAGE_BYTES} bytes`);
}

async function trim(runId: string) {
  const dir = join(OUT, runId);
  const runFile = join(dir, "run.json");
  const run = JSON.parse(readFileSync(runFile, "utf8")) as { turns: { image: string; width: number; height: number }[] };

  const raws = await Promise.all(run.turns.map((t) => readRaw(join(dir, t.image))));
  const boxes = raws.map(kioskBox);
  const framed = boxes.filter((b): b is Box => b !== null);
  if (framed.length < run.turns.length / 2) {
    console.log(`${runId}: no recording frame (${framed.length} of ${run.turns.length} frames), left as is`);
    return;
  }
  // One box for the run, from the median edges, so a frame whose kiosk is dark at its own edge does not shrink it.
  const l = median(framed.map((b) => b.left));
  const t = median(framed.map((b) => b.top));
  const r = median(framed.map((b) => b.left + b.width));
  const b = median(framed.map((b) => b.top + b.height));
  const box: Box = { left: l, top: t, width: r - l, height: b - t };
  const worst = Math.max(...raws.map((raw) => strayOutside(raw, box)));
  if (worst > MAX_STRAY) throw new Error(`${runId}: ${(worst * 100).toFixed(2)}% of the cut area is not frame; would cut the kiosk`);

  const out: Buffer[] = [];
  for (const turn of run.turns) out.push(await encode(join(dir, turn.image), box));
  run.turns.forEach((turn, i) => {
    writeFileSync(join(dir, turn.image), out[i]);
    turn.width = box.width;
    turn.height = box.height;
  });
  writeFileSync(runFile, `${JSON.stringify(run, null, 1)}\n`);

  const bytes = readdirSync(dir).reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);
  if (bytes > MAX_RUN_BYTES) throw new Error(`${runId}: ${bytes} bytes, over ${MAX_RUN_BYTES}`);
  console.log(
    `${runId}: cut ${raws[0].width}×${raws[0].height} to ${box.width}×${box.height} at (${box.left}, ${box.top}); ` +
      `largest stray share ${(worst * 100).toFixed(3)}%; ${(bytes / 1024 / 1024).toFixed(2)} MB`,
  );
}

async function main() {
  const only = process.argv.slice(2);
  const runs = readdirSync(OUT).filter((d) => statSync(join(OUT, d)).isDirectory() && (only.length === 0 || only.includes(d)));
  for (const runId of runs) await trim(runId);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
