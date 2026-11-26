import { defineConfig } from "vitest/config";

// The flow filter's tests, outside `npm run test`: `npx vitest run --root spikes/speaker-gate/candidates/l3-flow-text`.
export default defineConfig({ test: { include: ["*.test.ts"], environment: "node" } });
