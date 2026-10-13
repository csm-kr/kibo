// The voice relay E2E stack (e2e/voice.live.spec.ts, relay mode; started by playwright.config.ts with E2E_LIVE=1):
// a Next.js dev server with GEMINI_LIVE_BACKEND=vertex and the kibo-voice relay (voice-relay/server.ts) in one
// process, so both share the in-memory session store (src/lib/store/index.ts keeps it on globalThis). The relay
// talks to real Vertex AI Live with gcloud application default credentials, as in production. Local tests only.
import { createServer } from "node:http";
import next from "next";
import { startRelay } from "../voice-relay/server";

const PORT = Number(process.env.PORT ?? 3110);
const RELAY_PORT = Number(process.env.RELAY_PORT ?? 3111);

async function main() {
  process.env.GEMINI_LIVE_BACKEND = "vertex";
  process.env.VOICE_RELAY_URL = `ws://localhost:${RELAY_PORT}/ws`;
  const relay = await startRelay({ port: RELAY_PORT });

  const app = next({ dev: true, dir: process.cwd(), hostname: "localhost", port: PORT });
  await app.prepare();
  const handle = app.getRequestHandler();
  const upgrade = app.getUpgradeHandler();
  const server = createServer((req, res) => void handle(req, res));
  // Hot reload's socket.
  server.on("upgrade", (req, socket, head) => void upgrade(req, socket, head));
  await new Promise<void>((resolve) => server.listen(PORT, "localhost", resolve));
  console.log(`e2e relay stack: app http://localhost:${PORT}, relay ws://localhost:${RELAY_PORT}/ws`);

  const stop = () => {
    server.close();
    void relay.close().finally(() => process.exit(0));
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((e: unknown) => {
  console.error("e2e relay stack failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
