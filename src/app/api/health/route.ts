import { GoogleGenAI } from "@google/genai";
import pkg from "../../../../package.json";
import { relayHealthzUrl, voiceRelayUrl } from "@/lib/agent/liveBackend";
import { textModels } from "@/lib/agent/model";
import { createDeepHealth } from "@/lib/health";
import { clientIp, fail, ok } from "@/lib/http";
import { checkIpLimit } from "@/lib/limits/ip";
import { getStore, storeKind } from "@/lib/store";

// Liveness check for Cloud Run and uptime monitoring; `?deep=1` also probes the store, both Gemini models and billing.
// Runs on Node.js, the default; `runtime` config is not allowed with cacheComponents.
// Reading the request keeps this handler dynamic under cacheComponents. It happens outside
// the try, because during the build Next.js stops prerendering by throwing there and fail() must not catch it.

let keyAi: GoogleGenAI | null = null;
let tokenAi: GoogleGenAI | null = null;

function apiKey(): string {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  return process.env.GEMINI_API_KEY;
}

const deepHealth = createDeepHealth({
  store: getStore,
  api: () => (keyAi ??= new GoogleGenAI({ apiKey: apiKey() })).models,
  // The text agent's path (GEMINI_TEXT_BACKEND): with auto, the API key with Vertex AI as the fallback.
  text: textModels,
  // Ephemeral tokens exist only in v1alpha, as in src/lib/agent/live.ts.
  liveTokens: () => (tokenAi ??= new GoogleGenAI({ apiKey: apiKey(), httpOptions: { apiVersion: "v1alpha" } })).authTokens,
  // The Vertex voice relay (kibo-voice), when VOICE_RELAY_URL is set.
  liveRelay: () => {
    const url = voiceRelayUrl();
    return url ? async () => (await fetch(relayHealthzUrl(url), { cache: "no-store" })).ok : null;
  },
  textModel: process.env.GEMINI_TEXT_MODEL ?? "gemini-3.8-flash",
  liveModel: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.8-live",
  now: Date.now,
});

export async function GET(req: Request) {
  const ip = clientIp(req);
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  try {
    checkIpLimit(ip, "api");
    if (deep) {
      const result = await deepHealth();
      return ok(result, { status: result.ok ? 200 : 503 });
    }
    return ok({
      service: "kibo",
      version: pkg.version,
      store: storeKind(),
      revision: process.env.K_REVISION ?? "local",
      time: new Date().toISOString(),
    });
  } catch (e) {
    return fail(e);
  }
}
