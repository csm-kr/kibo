import { GoogleGenAI } from "@google/genai";
import pkg from "../../../../package.json";
import { textGenAI } from "@/lib/agent/model";
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
  // The same client the text agent uses: Vertex AI by default, the Gemini API with GEMINI_TEXT_BACKEND=api.
  text: () => textGenAI().models,
  // Ephemeral tokens exist only in v1alpha, as in src/lib/agent/live.ts.
  liveTokens: () => (tokenAi ??= new GoogleGenAI({ apiKey: apiKey(), httpOptions: { apiVersion: "v1alpha" } })).authTokens,
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
