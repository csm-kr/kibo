import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { kioskBox, type Raw } from "./learn-trim";

// The /learn replay frames are recorded screenshots; the recording page drew a dark frame around the kiosk, which
// showed as a black box beside it on /learn (GitHub #1 item 17). scripts/learn-trim.ts cuts that frame away.

/** A synthetic RGB screenshot: `pad` everywhere, `fill` inside `box`, and an optional last row of `lastRow`. */
function shot(w: number, h: number, pad: number[], box: { left: number; top: number; width: number; height: number } | null, fill: number[], lastRow?: number[]): Raw {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = box && x >= box.left && x < box.left + box.width && y >= box.top && y < box.top + box.height;
      const c = lastRow && y === h - 1 ? lastRow : inside ? fill : pad;
      data.set(c, (y * w + x) * 3);
    }
  }
  return { data, width: w, height: h, channels: 3 };
}

const DARK = [30, 26, 23];
const CREAM = [252, 246, 241];

describe("kioskBox", () => {
  it("finds the kiosk inside a dark frame on three sides, ignoring a light line under the recording", () => {
    const raw = shot(72, 107, DARK, { left: 12, top: 0, width: 48, height: 85 }, CREAM, [200, 200, 200]);
    expect(kioskBox(raw)).toEqual({ left: 12, top: 0, width: 48, height: 85 });
  });

  it("finds a tall kiosk with a frame on the left and right only", () => {
    const raw = shot(72, 107, [17, 28, 45], { left: 15, top: 0, width: 42, height: 107 }, [240, 240, 240]);
    expect(kioskBox(raw)).toEqual({ left: 15, top: 0, width: 42, height: 107 });
  });

  it("keeps a dark kiosk area that touches only one side (a cart bar is not a frame)", () => {
    // A full-page kiosk on cream with a dark bar along its bottom: no frame on the left and right, so nothing to trim.
    const raw = shot(72, 107, CREAM, { left: 0, top: 95, width: 72, height: 12 }, [34, 34, 34]);
    expect(kioskBox(raw)).toBeNull();
  });

  it("does not take a light page background for a frame", () => {
    const raw = shot(72, 107, CREAM, { left: 12, top: 0, width: 48, height: 85 }, [255, 255, 255]);
    expect(kioskBox(raw)).toBeNull();
  });
});

describe("recorded frames in public/learn", () => {
  const runs = readdirSync("public/learn").filter((d) => statSync(join("public/learn", d)).isDirectory());

  it("no frame keeps the dark recording frame beside the kiosk, and the sizes in run.json are the files' own", async () => {
    const framed: string[] = [];
    for (const run of runs) {
      const data = JSON.parse(readFileSync(join("public/learn", run, "run.json"), "utf8")) as {
        turns: { image: string; width: number; height: number }[];
      };
      for (const t of data.turns) {
        const file = join("public/learn", run, t.image);
        const { data: px, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
        expect([info.width, info.height], file).toEqual([t.width, t.height]);
        if (kioskBox({ data: px, width: info.width, height: info.height, channels: info.channels })) framed.push(file);
      }
    }
    expect(framed).toEqual([]);
  }, 120_000);

  it("each run stays within 5 MB and each frame within 60 KB", () => {
    for (const run of runs) {
      const dir = join("public/learn", run);
      let bytes = 0;
      for (const f of readdirSync(dir)) {
        const size = statSync(join(dir, f)).size;
        bytes += size;
        if (f.endsWith(".webp")) expect(size, `${dir}/${f}`).toBeLessThanOrEqual(60 * 1024);
      }
      expect(bytes, dir).toBeLessThanOrEqual(5 * 1024 * 1024);
    }
  });
});
