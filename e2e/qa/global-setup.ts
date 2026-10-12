import { mkdirSync, rmSync } from "node:fs";
import type { FullConfig } from "@playwright/test";

// Every spec appends to ui-qa.jsonl, so a run starts from an empty report.
export default function globalSetup(config: FullConfig) {
  const out = String(config.metadata.qaOut);
  mkdirSync(out, { recursive: true });
  rmSync(`${out}/ui-qa.jsonl`, { force: true });
}
