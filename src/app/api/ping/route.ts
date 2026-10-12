import { z } from "zod";
import { sessionId } from "@/lib/commands/schemas";
import { bearer, clientIp, fail, ok, parseBody, readJson } from "@/lib/http";
import { checkIpLimit } from "@/lib/limits/ip";
import { ping } from "@/lib/session/service";
import { getStore } from "@/lib/store";

const bodySchema = z.strictObject({ sessionId, active: z.boolean() });

// 30 s heartbeat from the phone and kiosk; serverTime lets screens correct for clock offset.
export async function POST(req: Request) {
  try {
    checkIpLimit(clientIp(req), "api");
    const input = parseBody(bodySchema, await readJson(req));
    return ok(await ping(getStore(), { ...input, bearer: bearer(req) }, Date.now()));
  } catch (e) {
    return fail(e);
  }
}
