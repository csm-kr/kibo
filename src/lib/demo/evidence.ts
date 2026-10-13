import { parseHumanRuns, parseTouchRun } from "./compare";

// Evidence for the /demo comparison card, bundled at build time (no file reads at runtime). `import.meta.glob`
// (Turbopack) matches nothing when a file is missing, so a missing file hides its numbers instead of breaking the build.

function first(files: Record<string, unknown>): unknown {
  return Object.values(files)[0];
}

/** The efficient touch path (e2e/kiosk-touch-efficient.spec.ts). */
export const TOUCH_RUN = parseTouchRun(first(import.meta.glob("/evidence/touch-hero-efficient.json", { eager: true, import: "default" })));

/** The edit path's taps (e2e/kiosk-touch.spec.ts), shown only as a footnote. */
const editRaw = first(import.meta.glob("/evidence/touch-hero.json", { eager: true, import: "default" })) as { taps?: unknown } | undefined;
export const EDIT_PATH_TAPS = typeof editRaw?.taps === "number" ? editRaw.taps : null;

/** Human runs by the team (scripts/measure-touch.md); preferred over the automated run when present. */
export const HUMAN_RUNS = parseHumanRuns(first(import.meta.glob("/evidence/human-runs.json", { eager: true, import: "default" })));
