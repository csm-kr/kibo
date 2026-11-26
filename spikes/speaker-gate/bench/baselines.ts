// The built-in baselines, written through the same file contract as any candidate (README "Crowd benchmark"):
//   open             the mix unchanged, no segments: today's production, an open microphone.
//   hold-oracle      the mix unchanged, segments = the customer's speech ± 0.2 s: the ceiling of any gate (a perfect
//                    hold to talk, as run.ts --ptt-end).
//   customer-oracle  the clean customer audio: the ceiling of extraction.
//   text-oracle      the customer's words as text at the end of their speech: the ceiling of a text candidate (A, L3).
// The oracles read refs/, which only the judge may do; a real candidate reads inputs/ only.
//   npx tsx spikes/speaker-gate/bench/baselines.ts

import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeWav, sha256 } from "./audio";

const BENCH = join(process.cwd(), "spikes/speaker-gate/bench");
export const BASELINES = ["open", "hold-oracle", "customer-oracle", "text-oracle"] as const;

interface Ref {
  customer: { text: string; startMs: number; endMs: number } | null;
}

function main() {
  const manifestSha = sha256(readFileSync(join(BENCH, "manifest.json")));
  const refs = JSON.parse(readFileSync(join(BENCH, "refs.json"), "utf8")).trials as Record<string, Ref>;
  for (const name of BASELINES) {
    mkdirSync(join(BENCH, "out", name), { recursive: true });
    writeFileSync(join(BENCH, "out", name, "MANIFEST"), manifestSha + "\n");
    for (const [id, ref] of Object.entries(refs)) {
      const dir = join(BENCH, "out", name, id);
      mkdirSync(dir, { recursive: true });
      const meta: Record<string, unknown> = { latency_ms: 0 };
      const c = ref.customer;
      if (name === "hold-oracle") meta.segments = c ? [[Math.max(0, c.startMs - 200), c.endMs + 200]] : [];
      if (name === "text-oracle") meta.text_turns = c ? [{ at_ms: c.endMs, text: c.text }] : [];
      if (name === "customer-oracle") {
        // The customer's clean speech, placed where it was spoken (out_offset_ms); an empty out.wav (silence) when
        // they say nothing.
        const out = join(dir, "out.wav");
        rmSync(out, { force: true });
        const file = join(BENCH, "refs", id, "customer.wav");
        // A hard link, not a copy: the disk is small and the bytes are the same.
        if (c && existsSync(file)) {
          linkSync(file, out);
          meta.out_offset_ms = c.startMs;
        } else writeFileSync(out, encodeWav(new Int16Array(0)));
      }
      writeFileSync(join(dir, "meta.json"), JSON.stringify(meta) + "\n");
    }
    console.log(`out/${name}: ${Object.keys(refs).length} trials`);
  }
}

if (process.argv[1]?.endsWith("baselines.ts")) main();
