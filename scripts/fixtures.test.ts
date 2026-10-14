// The committed voice fixtures (e2e/fixtures/*.wav, `npm run fixtures:voice`) are what Chromium's fake mic plays in the
// voice E2E: each must be a valid WAV whose sentence starts and ends quietly, with no click and no noise burst.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_LEAD_S, FIXTURE_TAIL_S, wavProblems } from "./wav";

const DIR = join(process.cwd(), "e2e/fixtures");
const files = readdirSync(DIR).filter((f) => f.endsWith(".wav"));

describe("e2e voice fixtures", () => {
  it("are all there", () => {
    expect(files.sort()).toEqual(["fries-en.wav", "hero-en.wav", "hero-ko.wav"]);
  });

  it.each(files)("%s: valid header, no flat tops, quiet edges, no click", (f) => {
    expect(wavProblems(readFileSync(join(DIR, f)), { leadS: FIXTURE_LEAD_S, tailS: FIXTURE_TAIL_S })).toEqual([]);
  });
});
