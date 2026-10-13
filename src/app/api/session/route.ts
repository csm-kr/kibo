import { z } from "zod";
import { claimUrl, clientIp, fail, ok, pairUrl, parseBody, readJson } from "@/lib/http";
import { checkIpLimit } from "@/lib/limits/ip";
import { createSession } from "@/lib/session/service";
import { getStore } from "@/lib/store";

// `pairPhone` (with `demo`): /demo "Use my phone", a demo session that a real phone claims instead of the page.
const bodySchema = z.strictObject({
  kioskId: z.string().min(1).max(64),
  demo: z.boolean().optional(),
  pairPhone: z.boolean().optional(),
});

// Called by the kiosk (or bridge) without a token, so it has its own tighter per-IP limit.
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    checkIpLimit(ip, "api");
    checkIpLimit(ip, "session");
    const input = parseBody(bodySchema, await readJson(req));
    const r = await createSession(getStore(), input, Date.now());
    return ok({
      sessionId: r.sessionId,
      claimUrl: claimUrl(req, r.sessionId, r.claimToken),
      kioskToken: r.kioskToken,
      expiresAt: r.expiresAt,
      ...(r.deviceToken ? { deviceToken: r.deviceToken } : {}),
      ...(r.pairCode ? { pairCode: r.pairCode, pairUrl: pairUrl(req) } : {}),
    });
  } catch (e) {
    return fail(e);
  }
}
