// Loaded into the local server by scripts/load-check.ts (NODE_OPTIONS=--import). Every 100 ms it writes the
// process's memory and open handles (by type, from process.getActiveResourcesInfo) to LOAD_PROBE_DIR/<pid>.json,
// so the load check can read them from outside. Its own timer counts as one "Timeout".
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.LOAD_PROBE_DIR;
if (dir) {
  const file = join(dir, `${process.pid}.json`);
  setInterval(() => {
    const handles = {};
    for (const type of process.getActiveResourcesInfo()) handles[type] = (handles[type] ?? 0) + 1;
    const m = process.memoryUsage();
    writeFileSync(file, JSON.stringify({ pid: process.pid, rss: m.rss, heapUsed: m.heapUsed, handles }));
  }, 100).unref();
}
