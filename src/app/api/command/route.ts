import { bearer, claimUrl, clientIp, fail, ok, readJson } from "@/lib/http";
import { checkIpLimit } from "@/lib/limits/ip";
import { runCommand } from "@/lib/session/service";
import { getStore } from "@/lib/store";

// Every state change (AI tools, phone buttons, kiosk touch, card action). runCommand parses the body
// with zod and takes prices and totals only from menu data.
export async function POST(req: Request) {
  try {
    checkIpLimit(clientIp(req), "api");
    const body = await readJson(req);
    const res = await runCommand(getStore(), { body, bearer: bearer(req) }, Date.now());
    const claimToken = res.result?.claimToken;
    if (claimToken) {
      // reissueClaim: runCommand accepted the body, so sessionId is a valid string.
      const { sessionId } = body as { sessionId: string };
      return ok({ ...res, claimUrl: claimUrl(req, sessionId, claimToken), pairCode: res.result?.pairCode });
    }
    return ok(res);
  } catch (e) {
    return fail(e);
  }
}
