import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The gate's own tests, outside `npm run test`: `npx vitest run --root spikes/crowd-voice`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  test: { include: ["*.test.ts"], environment: "node" },
});
