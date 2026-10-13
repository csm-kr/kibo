import { geminiTokenIssuer, liveTokenRequest } from "@/lib/agent/live";
import { liveBackendSetting, sharedKeyHealth, startLiveVoice, voiceRelayUrl } from "@/lib/agent/liveBackend";
import { bearer, clientIp, fail, ok, parseBody, readJson } from "@/lib/http";
import { checkIpLimit } from "@/lib/limits/ip";
import { getUsageStore } from "@/lib/limits/usage";
import { getStore } from "@/lib/store";

// How the phone's voice starts (ADR-003, ADR-012): a one-use Gemini Live token (`mode: "direct"`; the key stays
// here, the token carries model, instructions and tools), or the Vertex relay's address (`mode: "relay"`) when the
// key cannot serve voice. Neither reply holds instructions, tools or a key.
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    checkIpLimit(ip, "api");
    const body = parseBody(liveTokenRequest, await readJson(req));
    const deps = {
      store: getStore(),
      usage: getUsageStore(),
      issuer: geminiTokenIssuer(),
      now: Date.now,
      backend: liveBackendSetting(),
      relayUrl: voiceRelayUrl(),
      key: sharedKeyHealth(),
    };
    return ok(await startLiveVoice(deps, { ...body, bearer: bearer(req), ip }));
  } catch (e) {
    return fail(e);
  }
}
