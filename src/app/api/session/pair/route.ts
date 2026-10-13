import { z } from "zod";
import { clientIp, fail, ok, parseBody, readJson } from "@/lib/http";
import { checkIpLimit } from "@/lib/limits/ip";
import { pairSession } from "@/lib/session/service";
import { getStore } from "@/lib/store";

const bodySchema = z.strictObject({ code: z.string().regex(/^\d{6}$/) });

// `/app`'s code field. Same result as a QR claim; its own strict per-IP limit makes guessing codes impractical.
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    checkIpLimit(ip, "api");
    checkIpLimit(ip, "pair");
    const input = parseBody(bodySchema, await readJson(req));
    const { sessionId, deviceToken, session } = await pairSession(getStore(), input, Date.now());
    return ok({ sessionId, deviceToken, status: session.status });
  } catch (e) {
    return fail(e);
  }
}
