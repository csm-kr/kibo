import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The judge's own tests, outside `npm run test`: `npx vitest run --root spikes/speaker-gate/bench`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../../src", import.meta.url)) } },
  test: { include: ["*.test.ts"], environment: "node" },
});
