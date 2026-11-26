import { defineConfig } from "vitest/config";

// The loudness gate's tests, outside `npm run test`: `npx vitest run --root spikes/speaker-gate/candidates/l1-loud`.
export default defineConfig({ test: { include: ["*.test.ts"], environment: "node" } });
