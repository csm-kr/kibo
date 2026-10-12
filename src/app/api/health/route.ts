import { GoogleGenAI } from "@google/genai";
import pkg from "../../../../package.json";
import { createDeepHealth } from "@/lib/health";
import { clientIp, fail, ok } from "@/lib/http";
import { checkIpLimit } from "@/lib/limits/ip";
import { getStore, storeKind } from "@/lib/store";

// Liveness check for Cloud Run and uptime monitoring; `?deep=1` also probes the store and both Gemini models.
// Runs on Node.js, the default; `runtime` config is not allowed with cacheComponents.
// Reading the request keeps this handler dynamic under cacheComponents. It happens outside
// the try, because during the build Next.js stops prerendering by throwing there and fail() must not catch it.

let ai: GoogleGenAI | null = null;

const deepHealth = createDeepHealth({
  store: getStore,
  models: () => {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
    ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return ai.models;
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
