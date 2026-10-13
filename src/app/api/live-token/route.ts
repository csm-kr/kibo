import { geminiTokenIssuer, issueLiveToken, liveTokenRequest } from "@/lib/agent/live";
import { bearer, clientIp, fail, ok, parseBody, readJson } from "@/lib/http";
import { checkIpLimit } from "@/lib/limits/ip";
import { getUsageStore } from "@/lib/limits/usage";
import { getStore } from "@/lib/store";

// One-use Gemini Live token for the phone (ADR-003). The key stays here; the token carries model, instructions and tools.
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    checkIpLimit(ip, "api");
    const body = parseBody(liveTokenRequest, await readJson(req));
    const deps = { store: getStore(), usage: getUsageStore(), issuer: geminiTokenIssuer(), now: Date.now };
    return ok(await issueLiveToken(deps, { ...body, bearer: bearer(req), ip }));
  } catch (e) {
    return fail(e);
  }
}
